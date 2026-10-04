using Discorda.Api.Auth;
using Discorda.Api.Chat;
using Discorda.Core.Channels;
using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;

public static class Permissions
{
    public static async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginChange(DiscordaDbContext db, CancellationToken ct)
    {
        var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            // Serialize role changes with privileged mutations, including across API processes.
            // Authorization must be read after taking the lock, not before waiting for it.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891322)", ct);
            return transaction;
        }
        catch { await transaction.DisposeAsync(); throw; }
    }
    public static Guid User(HttpContext ctx) => ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
    public static int Rank(MemberRole role) => role switch { MemberRole.Owner => 3, MemberRole.Admin => 2, MemberRole.Moderator => 1, _ => 0 };
    public static async Task<MemberRole> Role(HttpContext ctx, IConfiguration config, DiscordaDbContext db, CancellationToken ct)
    {
        if (AdminEndpoints.IsAdmin(ctx, config)) return MemberRole.Owner;
        var role = await db.WorkspaceMembers.Where(m => m.WorkspaceId == ChatEndpoints.GroupId && m.UserId == User(ctx)).Select(m => m.Role).FirstOrDefaultAsync(ct);
        // Persisted Owner is never authority: only private host configuration grants ownership.
        return role == MemberRole.Owner ? MemberRole.Member : role;
    }
    public static async Task<MemberRole> TargetRole(Guid user, IConfiguration config, DiscordaDbContext db, CancellationToken ct)
    {
        var email = await db.Users.Where(x => x.Id == user).Select(x => x.Email).FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(config["Admin:Email"]) && string.Equals(email, config["Admin:Email"], StringComparison.OrdinalIgnoreCase)) return MemberRole.Owner;
        var role = await db.WorkspaceMembers.Where(m => m.WorkspaceId == ChatEndpoints.GroupId && m.UserId == user).Select(m => m.Role).FirstOrDefaultAsync(ct);
        return role == MemberRole.Owner ? MemberRole.Member : role;
    }
    public static void Audit(DiscordaDbContext db, HttpContext ctx, string action, string target) =>
        db.ManagementAudits.Add(new ManagementAudit { ActorId = User(ctx), Action = action, Target = target });
}
