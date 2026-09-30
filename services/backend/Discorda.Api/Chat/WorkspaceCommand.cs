using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Chat;

public static class WorkspaceCommand
{
    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        if (args.Length != 3 || args[1] != "owner") { Console.Error.WriteLine("Usage: workspace owner email@example.com"); return 2; }
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DiscordaDbContext>();
        var email = args[2].Trim().ToLowerInvariant();
        var allowed = await db.AllowedUsers.SingleOrDefaultAsync(x => x.NormalizedEmail == email && x.Enabled);
        if (allowed?.BoundUserId is not Guid user || !await db.Workspaces.AnyAsync(x => x.Id == ChatEndpoints.GroupId))
        { Console.Error.WriteLine("Workspace must be migrated and owner must have completed an authorized login."); return 1; }
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.workspace_members (\"WorkspaceId\", \"UserId\", \"Role\", \"JoinedAt\") VALUES ({ChatEndpoints.GroupId}, {user}, 'Owner', {DateTimeOffset.UtcNow}) ON CONFLICT (\"WorkspaceId\", \"UserId\") DO UPDATE SET \"Role\"='Owner'");
        db.AccessAudits.Add(new Discorda.Core.Users.AccessAudit { Action = "workspace.owner", TargetId = user });
        await db.SaveChangesAsync();
        Console.WriteLine("Workspace owner assigned."); return 0;
    }
}
