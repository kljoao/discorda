using System.Security.Cryptography;
using System.Text;
using Discorda.Api.Auth;
using Discorda.Core.Workspaces;
using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;
public static class Invitations
{
    public sealed record CreateInvite(int Hours, int MaxUses);
    public sealed record RequestJoin(string Token);
    public sealed record ReviewJoin(bool Approve);
    public static void MapInvitations(this WebApplication app)
    {
        var admin=app.MapGroup("/api/v1/admin").RequireAuthorization("Member");
        admin.AddEndpointFilter(async (ctx,next)=>AdminEndpoints.IsAdmin(ctx.HttpContext,app.Configuration)?await next(ctx):Results.Forbid());
        admin.MapGet("/invites",async(DiscordaDbContext db,CancellationToken ct)=>Results.Ok(await db.ServerInvites.AsNoTracking().OrderByDescending(x=>x.ExpiresAt).Take(100).Select(x=>new{x.Id,x.ExpiresAt,x.MaxUses,x.Uses,x.Revoked}).ToListAsync(ct)));
        admin.MapPost("/invites",async(CreateInvite input,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            if(input.Hours is <1 or >168 || input.MaxUses is <1 or >100)return Results.BadRequest();
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891327)",ct);
            if(await db.ServerInvites.CountAsync(i=>!i.Revoked&&i.ExpiresAt>DateTimeOffset.UtcNow,ct)>=50)return Results.Conflict();
            var token=Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            var invite=new ServerInvite{TokenHash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))),ExpiresAt=DateTimeOffset.UtcNow.AddHours(input.Hours),MaxUses=input.MaxUses};
            db.ServerInvites.Add(invite);Permissions.Audit(db,ctx,"invite.create",invite.Id.ToString());await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
            return Results.Ok(new{invite.Id,token,invite.ExpiresAt});
        }).RequireRateLimiting("admin-writes");
        admin.MapDelete("/invites/{id:guid}",async(Guid id,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891327)",ct);
            await db.ServerInvites.Where(i=>i.Id==id).ExecuteUpdateAsync(s=>s.SetProperty(i=>i.Revoked,true),ct);Permissions.Audit(db,ctx,"invite.revoke",id.ToString());await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        admin.MapGet("/join-requests",async(DiscordaDbContext db,CancellationToken ct)=>Results.Ok(await db.JoinRequests.AsNoTracking().Where(r=>r.Status=="pending").OrderBy(r=>r.CreatedAt).Take(200).Select(r=>new{r.Id,r.Name,r.Email,r.CreatedAt}).ToListAsync(ct)));
        admin.MapPut("/join-requests/{id:guid}",async(Guid id,ReviewJoin input,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891327)",ct);
            var request=await db.JoinRequests.SingleOrDefaultAsync(r=>r.Id==id,ct);if(request is null)return Results.NotFound();if(request.Status!="pending")return Results.Conflict();
            if(input.Approve){
                var invite=await db.ServerInvites.SingleAsync(i=>i.Id==request.InviteId,ct);if(invite.Revoked||invite.ExpiresAt<=DateTimeOffset.UtcNow)return Results.Conflict();
                var subject=request.Subject.ToString();var user=await db.Users.SingleOrDefaultAsync(u=>u.AuthIssuer==request.Issuer&&u.AuthSubject==subject,ct);
                var allowed=await db.AllowedUsers.FromSqlInterpolated($"SELECT * FROM discorda.allowed_users WHERE \"NormalizedEmail\"={request.Email} FOR UPDATE").SingleOrDefaultAsync(ct);
                if(allowed?.BoundUserId is Guid bound&&bound!=user?.Id)return Results.Conflict();
                if(user is not null&&await db.AllowedUsers.AnyAsync(a=>a.BoundUserId==user.Id&&a.NormalizedEmail!=request.Email,ct))return Results.Conflict();
                if(user is null){user=new User{AuthIssuer=request.Issuer,AuthSubject=subject,Email=request.Email,DisplayName=request.Name};db.Users.Add(user);}
                if(allowed is null){allowed=new AllowedUser{NormalizedEmail=request.Email};db.AllowedUsers.Add(allowed);}allowed.Enabled=true;allowed.BoundUserId=user.Id;allowed.UpdatedAt=DateTimeOffset.UtcNow;
            }
            request.Status=input.Approve?"approved":"rejected";Permissions.Audit(db,ctx,input.Approve?"join.approve":"join.reject",id.ToString());await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        app.MapPost("/api/v1/auth/join-request",async(RequestJoin input,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            if(input.Token is null||input.Token.Length!=64||input.Token.Any(c=>!char.IsAsciiHexDigit(c)))return Results.BadRequest();
            var identity=(VerifiedIdentity)ctx.Items[typeof(VerifiedIdentity)]!;var issuer=ctx.User.FindFirst("iss")!.Value;
            var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input.Token)));
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891327)",ct);
            var invite=await db.ServerInvites.SingleOrDefaultAsync(i=>i.TokenHash==hash,ct);if(invite is null||invite.Revoked||invite.ExpiresAt<=DateTimeOffset.UtcNow)return Results.NotFound();
            var existing=await db.JoinRequests.SingleOrDefaultAsync(r=>r.InviteId==invite.Id&&r.Subject==identity.Subject,ct);if(existing is not null)return Results.Ok(new{status=existing.Status});
            if(invite.Uses>=invite.MaxUses||await db.JoinRequests.CountAsync(r=>r.Status=="pending",ct)>=200)return Results.Conflict();
            invite.Uses++;db.JoinRequests.Add(new JoinRequest{InviteId=invite.Id,Subject=identity.Subject,Issuer=issuer,Email=identity.Email,Name=identity.DisplayName});await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return Results.Ok(new{status="pending"});
        }).RequireAuthorization("VerifiedGoogle").RequireRateLimiting("admin-writes");
    }
}
