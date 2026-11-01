using Discorda.Api.Chat;
using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;

public static class PermissionEndpoints
{
    public sealed record RoleInput(string Name,string Color,int Position,long Permissions,long Version=0);
    public sealed record AssignmentInput(Guid[] RoleIds,long Version);
    public sealed record OverwriteInput(string TargetType,Guid TargetId,long Allow,long Deny,long Version=0);
    public sealed record ChannelInput(string Name,long Version,bool Archived=false);
    private static bool ValidName(string? name,int max)=>!string.IsNullOrWhiteSpace(name)&&name.Trim().Length<=max&&!name.Any(c=>char.IsControl(c)||char.GetUnicodeCategory(c)==System.Globalization.UnicodeCategory.Format);
    private static bool CanRole(PermissionSnapshot s,Guid actor,PermissionRole role)=>s.Has(actor,Permission.ManageRoles)&&(role.IsEveryone||s.Position(actor)>role.Position);
    private static bool CanGrant(PermissionSnapshot s,Guid actor,Permission flags)=>((long)flags&~(long)Permission.All)==0&&(flags&~s.Base(actor))==0;
    private static bool CanChangeChannel(PermissionSnapshot s,Guid actor,Guid channel,IEnumerable<ChannelPermissionOverwrite> rules){
        var proposed=rules.ToArray();var granted=s.In(actor,channel);
        return s.Members.Keys.All(user=>((s.In(user,channel,proposed)&~s.In(user,channel))&~granted)==0);
    }
    private static async Task Changed(DiscordaDbContext db,HttpContext ctx,LiveChat live,Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction tx,string action,string target,CancellationToken ct)
    {
        Permissions.Audit(db,ctx,action,target);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
        await live.Publish("channels",new{id=ChatEndpoints.GroupId});await live.SendPresence(ct);
    }
    public static void MapPermissionManagement(this WebApplication app)
    {
        var api=app.MapGroup("/api/v1/chat").RequireAuthorization("Member");
        api.MapGet("/permissions",async(HttpContext ctx,ChannelPermissions permissions,CancellationToken ct)=>{
            var s=await permissions.Load(ct);var actor=Permissions.User(ctx);
            if(!s.Has(actor,Permission.ManageRoles))return Results.Forbid();
            return Results.Ok(new{
                roles=s.Roles.OrderByDescending(r=>r.Position).Select(r=>new{r.Id,r.Name,r.Color,r.Position,permissions=(long)r.Permissions,r.IsEveryone,r.Version,editable=CanRole(s,actor,r)}),
                members=s.Members.Values.OrderBy(m=>m.Name).Select(m=>new{m.Id,m.Name,m.Version,roleIds=s.RoleIds(m.Id),editable=s.Owner(actor)||(m.Id!=actor&&s.Position(actor)>s.Position(m.Id))}),
                granted=(long)s.Base(actor),position=s.Position(actor)
            });
        });
        api.MapPost("/permissions/roles",async(RoleInput input,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);var s=await permissions.Load(ct);var actor=Permissions.User(ctx);
            if(!s.Has(actor,Permission.ManageRoles)||input.Position>=s.Position(actor)||!CanGrant(s,actor,(Permission)input.Permissions))return Results.Forbid();
            if(!ValidName(input.Name,40)||!System.Text.RegularExpressions.Regex.IsMatch(input.Color??"","\\A#[0-9a-fA-F]{6}\\z")||input.Position<1||input.Position>99||input.Version!=0)return Results.BadRequest();
            if(s.Roles.Any(r=>string.Equals(r.Name,input.Name.Trim(),StringComparison.OrdinalIgnoreCase)))return Results.Conflict(new{message="Já existe um cargo com este nome."});
            if(s.Roles.Length>=50)return Results.Conflict(new{message="Limite de 50 cargos atingido."});
            var role=new PermissionRole{WorkspaceId=ChatEndpoints.GroupId,Name=input.Name.Trim(),Color=input.Color!,Position=input.Position,Permissions=(Permission)input.Permissions};db.PermissionRoles.Add(role);
            await Changed(db,ctx,live,tx,"permission.role.create",role.Id.ToString(),ct);return Results.Ok(new{role.Id});
        }).RequireRateLimiting("admin-writes");
        api.MapPut("/permissions/roles/{roleId:guid}",async(Guid roleId,RoleInput input,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);var s=await permissions.Load(ct);var actor=Permissions.User(ctx);var role=await db.PermissionRoles.SingleOrDefaultAsync(r=>r.Id==roleId&&r.WorkspaceId==ChatEndpoints.GroupId,ct);
            if(role is null)return Results.NotFound();
            if(!CanRole(s,actor,role)||!CanGrant(s,actor,(Permission)input.Permissions)||(!role.IsEveryone&&input.Position>=s.Position(actor)))return Results.Forbid();
            if(role.Version!=input.Version)return Results.Conflict(new{message="Este cargo mudou. Recarregue antes de salvar."});
            if(!ValidName(input.Name,40)||!System.Text.RegularExpressions.Regex.IsMatch(input.Color??"","\\A#[0-9a-fA-F]{6}\\z")||input.Position<(role.IsEveryone?0:1)||input.Position>99||(role.IsEveryone&&(input.Position!=0||input.Name!="@todos")))return Results.BadRequest();
            if(s.Roles.Any(r=>r.Id!=roleId&&string.Equals(r.Name,input.Name.Trim(),StringComparison.OrdinalIgnoreCase)))return Results.Conflict(new{message="Já existe um cargo com este nome."});
            role.Name=input.Name.Trim();role.Color=input.Color!;role.Position=input.Position;role.Permissions=(Permission)input.Permissions;role.Version++;
            await Changed(db,ctx,live,tx,"permission.role.update",role.Id.ToString(),ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        api.MapDelete("/permissions/roles/{roleId:guid}",async(Guid roleId,long version,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);var s=await permissions.Load(ct);var actor=Permissions.User(ctx);var role=await db.PermissionRoles.SingleOrDefaultAsync(r=>r.Id==roleId&&r.WorkspaceId==ChatEndpoints.GroupId,ct);
            if(role is null)return Results.NotFound();if(role.IsEveryone||!CanRole(s,actor,role))return Results.Forbid();if(role.Version!=version)return Results.Conflict();
            db.PermissionRoles.Remove(role);await Changed(db,ctx,live,tx,"permission.role.delete",roleId.ToString(),ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        api.MapPut("/permissions/members/{userId:guid}",async(Guid userId,AssignmentInput input,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);var s=await permissions.Load(ct);var actor=Permissions.User(ctx);
            if(!s.Has(actor,Permission.ManageRoles)||(!s.Owner(actor)&&(actor==userId||s.Position(actor)<=s.Position(userId))))return Results.Forbid();
            if(input.RoleIds is null||input.RoleIds.Length>49||input.RoleIds.Distinct().Count()!=input.RoleIds.Length)return Results.BadRequest();
            var member=await db.WorkspaceMembers.SingleOrDefaultAsync(m=>m.UserId==userId&&m.WorkspaceId==ChatEndpoints.GroupId,ct);if(member is null)return Results.NotFound();if(member.PermissionVersion!=input.Version)return Results.Conflict();
            var current=s.RoleIds(userId);var changed=current.SymmetricExcept(input.RoleIds);
            if(changed.Any(id=>!s.Roles.Any(r=>r.Id==id&&!r.IsEveryone&&CanRole(s,actor,r)&&CanGrant(s,actor,r.Permissions))))return Results.Forbid();
            await db.MemberPermissionRoles.Where(a=>a.UserId==userId&&s.Roles.Select(r=>r.Id).Contains(a.RoleId)).ExecuteDeleteAsync(ct);
            db.MemberPermissionRoles.AddRange(input.RoleIds.Select(id=>new MemberPermissionRole{RoleId=id,UserId=userId}));member.PermissionVersion++;
            await Changed(db,ctx,live,tx,"permission.member.roles",userId.ToString(),ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        api.MapGet("/channels/{channelId:guid}/permissions",async(Guid channelId,HttpContext ctx,ChannelPermissions permissions,CancellationToken ct)=>{
            var s=await permissions.Load(ct);var actor=Permissions.User(ctx);
            if(!s.Has(actor,Permission.ViewChannel,channelId))return Results.NotFound();
            if(!s.Has(actor,Permission.ManagePermissions,channelId)&&!s.Has(actor,Permission.ManageChannel,channelId))return Results.Forbid();
            var channel=s.Channels[channelId];
            return Results.Ok(new{channel=new{channel.Id,channel.Name,channel.Version},granted=(long)s.In(actor,channelId),
                roles=s.Roles.OrderByDescending(r=>r.Position).Select(r=>new{r.Id,r.Name,r.Color,r.IsEveryone}),
                members=s.Members.Values.OrderBy(m=>m.Name).Select(m=>new{m.Id,m.Name,access=s.Has(m.Id,Permission.ViewChannel,channelId)}),
                overwrites=s.Overwrites.Where(o=>o.ChannelId==channelId).Select(o=>new{o.Id,o.RoleId,o.UserId,allow=(long)o.Allow,deny=(long)o.Deny,o.Version})});
        });
        api.MapPut("/channels/{channelId:guid}/permissions",async(Guid channelId,OverwriteInput input,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);var s=await permissions.Load(ct);var actor=Permissions.User(ctx);
            if(!s.Has(actor,Permission.ViewChannel|Permission.ManagePermissions,channelId))return Results.Forbid();
            var flags=(Permission)(input.Allow|input.Deny);
            if(input.Allow<0||input.Deny<0||(input.Allow&input.Deny)!=0||(flags&~Permission.Channel)!=0||input.TargetType is not("role" or "member"))return Results.BadRequest();
            if(((Permission)input.Allow&~s.In(actor,channelId))!=0)return Results.Forbid();
            if(input.TargetType=="role"&&!s.Roles.Any(r=>r.Id==input.TargetId)||input.TargetType=="member"&&!s.Members.ContainsKey(input.TargetId))return Results.BadRequest();
            var role=input.TargetType=="role"?(Guid?)input.TargetId:null;var user=input.TargetType=="member"?(Guid?)input.TargetId:null;
            var row=await db.ChannelPermissionOverwrites.SingleOrDefaultAsync(o=>o.ChannelId==channelId&&o.RoleId==role&&o.UserId==user,ct);
            if((row?.Version??0)!=input.Version)return Results.Conflict(new{message="As regras mudaram. Recarregue antes de salvar."});
            if(row is null){if(s.Overwrites.Count(o=>o.ChannelId==channelId)>=200)return Results.Conflict();row=new(){ChannelId=channelId,RoleId=role,UserId=user};db.ChannelPermissionOverwrites.Add(row);}else row.Version++;
            row.Allow=(Permission)input.Allow;row.Deny=(Permission)input.Deny;
            if(!CanChangeChannel(s,actor,channelId,s.Overwrites.Where(o=>o.ChannelId!=channelId||o.RoleId!=role||o.UserId!=user).Append(row)))return Results.Forbid();
            await Changed(db,ctx,live,tx,"permission.channel.update",channelId.ToString(),ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        api.MapDelete("/channels/{channelId:guid}/permissions/{overwriteId:guid}",async(Guid channelId,Guid overwriteId,long version,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);var s=await permissions.Load(ct);if(!await permissions.Has(ctx,Permission.ViewChannel|Permission.ManagePermissions,channelId))return Results.Forbid();
            var row=await db.ChannelPermissionOverwrites.SingleOrDefaultAsync(o=>o.Id==overwriteId&&o.ChannelId==channelId,ct);if(row is null)return Results.NotFound();if(row.Version!=version)return Results.Conflict();
            if(!CanChangeChannel(s,Permissions.User(ctx),channelId,s.Overwrites.Where(o=>o.Id!=row.Id)))return Results.Forbid();
            db.ChannelPermissionOverwrites.Remove(row);await Changed(db,ctx,live,tx,"permission.channel.inherit",channelId.ToString(),ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        api.MapPut("/channels/{channelId:guid}/settings",async(Guid channelId,ChannelInput input,HttpContext ctx,DiscordaDbContext db,ChannelPermissions permissions,LiveChat live,CancellationToken ct)=>{
            await using var tx=await Permissions.BeginChange(db,ct);if(!await permissions.Has(ctx,Permission.ViewChannel|Permission.ManageChannel,channelId))return Results.Forbid();
            if(!ValidName(input.Name,80))return Results.BadRequest();var channel=await db.Channels.SingleAsync(c=>c.Id==channelId,ct);if(channel.Version!=input.Version)return Results.Conflict();
            channel.Name=input.Name.Trim();channel.ArchivedAt=input.Archived?DateTimeOffset.UtcNow:null;channel.Version++;
            await Changed(db,ctx,live,tx,"channel.settings",channelId.ToString(),ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
    }
    private static HashSet<Guid> SymmetricExcept(this HashSet<Guid> current,IEnumerable<Guid> next){var result=new HashSet<Guid>(current);result.SymmetricExceptWith(next);return result;}
}
