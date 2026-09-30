using System.Net.Mail;
using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Auth;

public static class WhitelistCommand
{
    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        if (args.Length != 3 || args[1] is not ("allow" or "block") || !MailAddress.TryCreate(args[2], out var email)
            || email.Address != args[2] || args[2].Length > 320)
        { Console.Error.WriteLine("Usage: whitelist allow|block email@example.com"); return 2; }
        await using var scope = services.CreateAsyncScope();
        var database = scope.ServiceProvider.GetRequiredService<DiscordaDbContext>();
        var address = email.Address.Trim().ToLowerInvariant();
        await using var transaction = await database.Database.BeginTransactionAsync();
        var allowed = await database.AllowedUsers.FromSqlInterpolated(
            $"SELECT * FROM discorda.allowed_users WHERE \"NormalizedEmail\" = {address} FOR UPDATE").SingleOrDefaultAsync();
        if (allowed is null)
        {
            allowed = new AllowedUser { NormalizedEmail = address };
            database.AllowedUsers.Add(allowed);
        }
        allowed.Enabled = args[1] == "allow";
        allowed.UpdatedAt = DateTimeOffset.UtcNow;
        if (!allowed.Enabled && allowed.BoundUserId is Guid userId)
            await database.ApplicationSessions.Where(x => x.UserId == userId && x.RevokedAt == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.RevokedAt, DateTimeOffset.UtcNow));
        database.AccessAudits.Add(new AccessAudit { Action = "whitelist." + args[1], TargetId = allowed.Id });
        await database.SaveChangesAsync();
        await transaction.CommitAsync();
        Console.WriteLine("Whitelist updated. Existing revoked sessions remain revoked.");
        return 0;
    }
}
