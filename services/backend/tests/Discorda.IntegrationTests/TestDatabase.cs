using Npgsql;
using Testcontainers.PostgreSql;

namespace Discorda.IntegrationTests;

// Native loopback PostgreSQL is optional; CI retains the isolated container default.
public sealed class TestDatabase:IAsyncDisposable
{
    private readonly string? native=Environment.GetEnvironmentVariable("DISCORDA_TEST_POSTGRES");
    private PostgreSqlContainer? container;
    private string? connection;
    private readonly string database="discorda_test_"+Guid.NewGuid().ToString("N");
    public string GetConnectionString()=>connection??throw new InvalidOperationException("Start the isolated test database first.");
    public async Task StartAsync()
    {
        if(string.IsNullOrWhiteSpace(native)){
            container=new PostgreSqlBuilder("postgres:17.11-alpine3.23").Build();await container.StartAsync();connection=container.GetConnectionString();return;
        }
        var options=new NpgsqlConnectionStringBuilder(native);
        if(options.Host is not("127.0.0.1" or "localhost" or "::1"))throw new InvalidOperationException("Native tests require a loopback database.");
        options.Database="postgres";
        await using var admin=new NpgsqlConnection(options.ConnectionString);await admin.OpenAsync();
        await using var command=new NpgsqlCommand("CREATE DATABASE \""+database+"\"",admin);await command.ExecuteNonQueryAsync();
        options.Database=database;connection=options.ConnectionString;
    }
    public async ValueTask DisposeAsync()
    {
        if(container is not null){await container.DisposeAsync();return;}
        if(connection is null||native is null)return;
        NpgsqlConnection.ClearAllPools();
        var options=new NpgsqlConnectionStringBuilder(native){Database="postgres"};
        await using var admin=new NpgsqlConnection(options.ConnectionString);await admin.OpenAsync();
        await using var command=new NpgsqlCommand("DROP DATABASE \""+database+"\" WITH (FORCE)",admin);await command.ExecuteNonQueryAsync();
    }
}
