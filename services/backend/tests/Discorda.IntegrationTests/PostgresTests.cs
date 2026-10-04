using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Discorda.IntegrationTests;

public sealed class PostgresTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17.11-alpine3.23").Build();
    private DbContextOptions<DiscordaDbContext> Options => new DbContextOptionsBuilder<DiscordaDbContext>()
        .UseNpgsql(_postgres.GetConnectionString(), postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "discorda"))
        .Options;

    public Task InitializeAsync() => _postgres.StartAsync();
    public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();

    [Fact]
    public async Task RuntimeAccountCanUseDataButCannotAlterSchemaRolesOrAuditHistory()
    {
        await using var owner = new DiscordaDbContext(Options);
        await owner.Database.MigrateAsync();
        var role = "runtime_" + Guid.NewGuid().ToString("N");
        var password = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        await using (var tx = await owner.Database.BeginTransactionAsync())
        {
            await owner.Database.ExecuteSqlInterpolatedAsync($"SELECT set_config('discorda.runtime_password', {password}, true)");
            var sql = RuntimeDatabasePermissions.CreateSql(role, password);
            Assert.DoesNotContain(password, sql);
            await owner.Database.ExecuteSqlRawAsync(sql);
            await tx.CommitAsync();
        }
        await owner.Database.ExecuteSqlRawAsync(RuntimeDatabasePermissions.GrantSql(role));
        var connection = new Npgsql.NpgsqlConnectionStringBuilder(_postgres.GetConnectionString()) { Username = role, Password = password };
        await using var runtime = new DiscordaDbContext(new DbContextOptionsBuilder<DiscordaDbContext>().UseNpgsql(connection.ConnectionString, p => p.MigrationsHistoryTable("__EFMigrationsHistory", "discorda")).Options);
        Assert.Empty(await runtime.Database.GetPendingMigrationsAsync());
        runtime.Users.Add(new User { AuthIssuer="https://example.test", AuthSubject=Guid.NewGuid().ToString(), Email="member@example.test", DisplayName="Member" });
        await runtime.SaveChangesAsync();
        foreach (var sql in new[]{"CREATE TABLE discorda.denied (id int)","CREATE ROLE denied", "DELETE FROM discorda.management_audit", "DELETE FROM discorda.access_audit", "DELETE FROM discorda.\"__EFMigrationsHistory\""})
        {
            var error = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => runtime.Database.ExecuteSqlRawAsync(sql));
            Assert.Equal(Npgsql.PostgresErrorCodes.InsufficientPrivilege, error.SqlState);
        }
    }

    [Fact]
    public async Task MigrationCanBeReappliedAndAuthSubjectMustBeUnique()
    {
        await using var database = new DiscordaDbContext(Options);
        await database.Database.MigrateAsync();
        await database.Database.MigrateAsync();
        Assert.Empty(await database.Database.GetPendingMigrationsAsync());
        database.Users.Add(new User { AuthIssuer = "https://accounts.google.com", AuthSubject = "subject-1", Email = "friend@example.test", DisplayName = "Friend" });
        await database.SaveChangesAsync();
        database.Users.Add(new User { AuthIssuer = "https://accounts.google.com", AuthSubject = "subject-1", Email = "other@example.test", DisplayName = "Other" });
        await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
    }

    [Fact]
    public async Task WhitelistBindingRequiresAnExistingUser()
    {
        await using var database = new DiscordaDbContext(Options);
        await database.Database.MigrateAsync();
        database.AllowedUsers.Add(new AllowedUser { NormalizedEmail = "friend@example.test", BoundUserId = Guid.NewGuid() });
        await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
    }

    [Fact]
    public async Task ReadinessRequiresAppliedMigrations()
    {
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["ConnectionStrings:Database"] = _postgres.GetConnectionString() })));
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
        await using var database = new DiscordaDbContext(Options);
        await database.Database.MigrateAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
    }
}
