using Discorda.Api.Admin;
using Discorda.Api.Chat;
using Discorda.Core.Users;
using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;

namespace Discorda.IntegrationTests;

public sealed class PermissionMigrationTests
{
    [Fact]
    public async Task ExistingAdministratorsAndModeratorsBecomeEditableRolesWithoutLosingAccess()
    {
        await using var database=new TestDatabase();await database.StartAsync();
        await using var db=new DiscordaDbContext(new DbContextOptionsBuilder<DiscordaDbContext>().UseNpgsql(database.GetConnectionString(),p=>p.MigrationsHistoryTable("__EFMigrationsHistory","discorda")).Options);
        await db.GetService<IMigrator>().MigrateAsync("20261004184051_InvitationsAndStoragePolicy");
        var users=new[]{MemberRole.Admin,MemberRole.Moderator,MemberRole.Member}.Select(role=>(Role:role,User:new User{AuthIssuer="https://example.test",AuthSubject=Guid.NewGuid().ToString(),Email=Guid.NewGuid()+"@example.test",DisplayName=role.ToString()})).ToArray();
        foreach(var entry in users)await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.users (\"Id\",\"AuthIssuer\",\"AuthSubject\",\"Email\",\"DisplayName\",\"CreatedAt\") VALUES ({entry.User.Id},{entry.User.AuthIssuer},{entry.User.AuthSubject},{entry.User.Email},{entry.User.DisplayName},{entry.User.CreatedAt})");
        foreach(var entry in users)await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.workspace_members (\"WorkspaceId\",\"UserId\",\"Role\",\"JoinedAt\") VALUES ({ChatEndpoints.GroupId},{entry.User.Id},{entry.Role.ToString()},{DateTimeOffset.UtcNow})");
        await db.Database.MigrateAsync();await db.Database.MigrateAsync();db.ChangeTracker.Clear();
        Assert.False(db.Database.HasPendingModelChanges());Assert.Equal(3,await db.PermissionRoles.CountAsync());Assert.Equal(2,await db.MemberPermissionRoles.CountAsync());
        Assert.True(await db.WorkspaceMembers.AllAsync(m=>m.Role==MemberRole.Member));
        var policy=await ChannelPermissions.Read(db,new ConfigurationBuilder().Build());
        Assert.Equal(Permission.All,policy.Base(users[0].User.Id));
        Assert.True(policy.Has(users[1].User.Id,Permission.ManageMessages|Permission.ModerateVoice));
        Assert.Equal(Permission.Default,policy.Base(users[2].User.Id));
    }
}
