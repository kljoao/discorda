using Discorda.Api.Chat;
using Discorda.Core.Channels;
using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;

public sealed record PermissionMember(Guid Id,string Name,string Email,MemberRole LegacyRole,long Version=1);

public sealed class PermissionSnapshot
{
    public required PermissionRole[] Roles {get;init;}
    public required MemberPermissionRole[] Assignments {get;init;}
    public required ChannelPermissionOverwrite[] Overwrites {get;init;}
    public required Dictionary<Guid,Channel> Channels {get;init;}
    public required Dictionary<Guid,PermissionMember> Members {get;init;}
    public required string OwnerEmail {get;init;}
    private Dictionary<Guid,HashSet<Guid>>? assignmentIndex;
    private Dictionary<Guid,ChannelPermissionOverwrite[]>? ruleIndex;
    private readonly Dictionary<Guid,Permission> baseIndex=new();
    public bool Owner(Guid user)=>Members.TryGetValue(user,out var member)&&!string.IsNullOrWhiteSpace(OwnerEmail)&&string.Equals(member.Email,OwnerEmail,StringComparison.OrdinalIgnoreCase);
    public HashSet<Guid> RoleIds(Guid user){assignmentIndex??=Assignments.GroupBy(a=>a.UserId).ToDictionary(g=>g.Key,g=>g.Select(a=>a.RoleId).ToHashSet());if(!assignmentIndex.TryGetValue(user,out var ids))assignmentIndex[user]=ids=[];return ids;}
    public Permission Base(Guid user)
    {
        if(!Members.TryGetValue(user,out var member))return Permission.None;
        if(Owner(user)||member.LegacyRole==MemberRole.Admin)return Permission.All;
        if(baseIndex.TryGetValue(user,out var cached))return cached;
        var ids=RoleIds(user);
        var flags=Roles.Where(r=>r.IsEveryone||ids.Contains(r.Id)).Aggregate(Permission.None,(current,r)=>current|r.Permissions);
        if(member.LegacyRole==MemberRole.Moderator)flags|=Permission.ManageMessages|Permission.ModerateVoice;
        return baseIndex[user]=(flags&Permission.Administrator)!=0?Permission.All:flags;
    }
    public int Position(Guid user)=>Owner(user)?1000:Members.GetValueOrDefault(user)?.LegacyRole==MemberRole.Admin?100:
        Math.Max(Members.GetValueOrDefault(user)?.LegacyRole==MemberRole.Moderator?50:0,Roles.Where(r=>!r.IsEveryone&&RoleIds(user).Contains(r.Id)).Select(r=>r.Position).DefaultIfEmpty(0).Max());
    public Permission In(Guid user,Guid channel,IEnumerable<ChannelPermissionOverwrite>? alternative=null)
    {
        if(!Channels.ContainsKey(channel)||!Members.ContainsKey(user))return Permission.None;
        var ids=RoleIds(user);var everyone=Roles.Where(r=>r.IsEveryone).Select(r=>r.Id).ToHashSet();
        ruleIndex??=Overwrites.GroupBy(o=>o.ChannelId).ToDictionary(g=>g.Key,g=>g.ToArray());
        var rules=alternative is null?ruleIndex.GetValueOrDefault(channel)??[]:alternative.Where(o=>o.ChannelId==channel).ToArray();
        return PermissionRules.Resolve(Base(user),Owner(user),rules.Where(o=>o.RoleId.HasValue&&everyone.Contains(o.RoleId.Value)),
            rules.Where(o=>o.RoleId.HasValue&&!everyone.Contains(o.RoleId.Value)&&ids.Contains(o.RoleId.Value)),rules.Where(o=>o.UserId==user));
    }
    public bool Has(Guid user,Permission flags,Guid? channel=null)=>((channel.HasValue?In(user,channel.Value):Base(user))&flags)==flags;
    public Guid[] Visible(Guid user)=>Channels.Keys.Where(id=>Has(user,Permission.ViewChannel,id)).ToArray();
}

// Scoped to one HTTP request. Live delivery and media reconciliation load fresh snapshots.
public sealed class ChannelPermissions(DiscordaDbContext db,IConfiguration configuration)
{
    private Task<PermissionSnapshot>? snapshot;
    public Task<PermissionSnapshot> Load(CancellationToken ct=default)=>snapshot??=Read(db,configuration,ct);
    public void Invalidate()=>snapshot=null;
    public static async Task<PermissionSnapshot> Read(DiscordaDbContext db,IConfiguration config,CancellationToken ct=default)
    {
        var roles=await db.PermissionRoles.AsNoTracking().Where(r=>r.WorkspaceId==ChatEndpoints.GroupId).ToArrayAsync(ct);
        var ids=roles.Select(r=>r.Id).ToArray();
        return new PermissionSnapshot{
            Roles=roles,
            Assignments=await db.MemberPermissionRoles.AsNoTracking().Where(a=>ids.Contains(a.RoleId)).ToArrayAsync(ct),
            Overwrites=await db.ChannelPermissionOverwrites.AsNoTracking().Where(o=>db.Channels.Any(c=>c.Id==o.ChannelId&&c.WorkspaceId==ChatEndpoints.GroupId&&c.ArchivedAt==null)).ToArrayAsync(ct),
            Channels=await db.Channels.AsNoTracking().Where(c=>c.WorkspaceId==ChatEndpoints.GroupId&&c.ArchivedAt==null).ToDictionaryAsync(c=>c.Id,ct),
            Members=await (from member in db.WorkspaceMembers.AsNoTracking() join user in db.Users on member.UserId equals user.Id
                where member.WorkspaceId==ChatEndpoints.GroupId select new PermissionMember(user.Id,user.DisplayName,user.Email,member.Role,member.PermissionVersion)).ToDictionaryAsync(m=>m.Id,ct),
            OwnerEmail=config["Admin:Email"]??""
        };
    }
    public async Task<bool> Has(HttpContext ctx,Permission flags,Guid? channel=null)=> (await Load(ctx.RequestAborted)).Has(Permissions.User(ctx),flags,channel);
    public static ChannelPermissions From(HttpContext ctx)=>ctx.RequestServices.GetRequiredService<ChannelPermissions>();
    public static async ValueTask<object?> Guard(EndpointFilterInvocationContext context,EndpointFilterDelegate next)
    {
        var ctx=context.HttpContext;
        if(!Guid.TryParse(ctx.Request.RouteValues.GetValueOrDefault("channelId")?.ToString(),out var id))return await next(context);
        var db=ctx.RequestServices.GetRequiredService<DiscordaDbContext>();
        var read=ctx.Request.Method=="GET";
        await db.Database.OpenConnectionAsync(ctx.RequestAborted);
        var locked=false;
        try{
        // Shared readers and exclusive mutations serialize with role changes, across API processes.
        // A session lock leaves endpoint-owned transactions intact on this explicitly held connection.
        await db.Database.ExecuteSqlRawAsync(read?"SELECT pg_advisory_lock_shared(74891322)":"SELECT pg_advisory_lock(74891322)",ctx.RequestAborted);locked=true;
        var required=Permission.ViewChannel;var path=ctx.Request.Path.Value??"";
        if(ctx.Request.Method!="GET"){
            if(path.EndsWith("/reaction"))required|=Permission.AddReactions;
            else if(path.EndsWith("/pin"))required|=Permission.ManageMessages;
            else if(ctx.Request.Method=="POST"&&path.EndsWith("/attachments"))required|=Permission.SendMessages|Permission.AttachFiles;
            else if((ctx.Request.Method=="POST"||ctx.Request.Method=="PUT")&&path.Contains("/messages")&&!path.EndsWith("/read"))required|=Permission.SendMessages;
        }
        if(!await From(ctx).Has(ctx,Permission.ViewChannel,id))return Results.NotFound();
        return await From(ctx).Has(ctx,required,id)?await next(context):Results.Forbid();
        }finally{
            try{if(locked)await db.Database.ExecuteSqlRawAsync(read?"SELECT pg_advisory_unlock_shared(74891322)":"SELECT pg_advisory_unlock(74891322)",CancellationToken.None);}
            finally{await db.Database.CloseConnectionAsync();}
        }
    }
}
