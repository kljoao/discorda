using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;

namespace Discorda.Api.Auth;

// Apply before authentication: provider verification is itself an expensive operation.
// The per-member limiter still runs afterwards, so friends behind one NAT keep independent budgets.
public sealed class AuthenticationBudget : IDisposable
{
    private readonly PartitionedRateLimiter<HttpContext> requests = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 600, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    private readonly ConcurrencyLimiter verification = new(new ConcurrencyLimiterOptions { PermitLimit = 64, QueueLimit = 0 });

    public async Task Invoke(HttpContext context, RequestDelegate next)
    {
        using var request = requests.AttemptAcquire(context);
        if (!request.IsAcquired) { Reject(context); return; }
        if (context.Request.Headers.Authorization.Count > 0)
        {
            // Release before dispatching the endpoint: a WebSocket must not hold a verification slot.
            using var slot = verification.AttemptAcquire();
            if (!slot.IsAcquired) { Reject(context); return; }
            await context.AuthenticateAsync(); // JwtBearer caches this result for UseAuthentication.
        }
        await next(context);
    }
    private static void Reject(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.Response.Headers.RetryAfter = "60";
    }
    public void Dispose() { requests.Dispose(); verification.Dispose(); }
}
