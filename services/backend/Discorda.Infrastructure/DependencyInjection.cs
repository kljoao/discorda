using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace Discorda.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        services.AddDbContext<DiscordaDbContext>((provider, options) => options.UseNpgsql(
            provider.GetRequiredService<IConfiguration>().GetConnectionString("Database"),
            postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "discorda")));
        return services;
    }
}
