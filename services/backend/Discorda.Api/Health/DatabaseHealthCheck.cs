using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Discorda.Api.Health;

public sealed class DatabaseHealthCheck(DiscordaDbContext database, IConfiguration configuration) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(configuration.GetConnectionString("Database")))
            return HealthCheckResult.Unhealthy("Database unavailable");
        try
        {
            if (!await database.Database.CanConnectAsync(cancellationToken))
                return HealthCheckResult.Unhealthy("Database unavailable");
            var pending = await database.Database.GetPendingMigrationsAsync(cancellationToken);
            return pending.Any() ? HealthCheckResult.Unhealthy("Database not ready") : HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return HealthCheckResult.Unhealthy("Database unavailable");
        }
    }
}
