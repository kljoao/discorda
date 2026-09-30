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
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17.9-alpine").Build();
    private DbContextOptions<DiscordaDbContext> Options => new DbContextOptionsBuilder<DiscordaDbContext>()
        .UseNpgsql(_postgres.GetConnectionString(), postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "discorda"))
        .Options;

    public Task InitializeAsync() => _postgres.StartAsync();
    public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();

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
