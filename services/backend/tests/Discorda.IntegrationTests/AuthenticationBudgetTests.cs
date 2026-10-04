using Discorda.Api.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;

namespace Discorda.IntegrationTests;

public sealed class AuthenticationBudgetTests
{
    private sealed class AuthenticationStub : IAuthenticationService
    {
        public int Calls;
        public TaskCompletionSource? Hold;
        public async Task<AuthenticateResult> AuthenticateAsync(HttpContext context, string? scheme)
        { Interlocked.Increment(ref Calls); if (Hold is not null) await Hold.Task; return AuthenticateResult.NoResult(); }
        public Task ChallengeAsync(HttpContext c, string? s, AuthenticationProperties? p) => Task.CompletedTask;
        public Task ForbidAsync(HttpContext c, string? s, AuthenticationProperties? p) => Task.CompletedTask;
        public Task SignInAsync(HttpContext c, string? s, ClaimsPrincipal u, AuthenticationProperties? p) => Task.CompletedTask;
        public Task SignOutAsync(HttpContext c, string? s, AuthenticationProperties? p) => Task.CompletedTask;
    }
    private static DefaultHttpContext Context(IServiceProvider services)
    {
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Headers.Authorization = "Bearer synthetic";
        return context;
    }
    [Fact]
    public async Task FloodIsRejectedBeforeProviderVerification()
    {
        var authentication = new AuthenticationStub();
        using var services = new ServiceCollection().AddSingleton<IAuthenticationService>(authentication).BuildServiceProvider();
        using var budget = new AuthenticationBudget();
        for (var i = 0; i < 600; i++) await budget.Invoke(Context(services), _ => Task.CompletedTask);
        var rejected = Context(services);
        await budget.Invoke(rejected, _ => throw new Exception("Rejected request reached endpoint"));
        Assert.Equal(429, rejected.Response.StatusCode);
        Assert.Equal(600, authentication.Calls);
    }
    [Fact]
    public async Task ConcurrentVerificationIsBoundedAndSlotsReleaseBeforePersistentEndpoints()
    {
        var authentication = new AuthenticationStub { Hold = new(TaskCreationOptions.RunContinuationsAsynchronously) };
        using var services = new ServiceCollection().AddSingleton<IAuthenticationService>(authentication).BuildServiceProvider();
        using var budget = new AuthenticationBudget();
        var endpoint = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = Enumerable.Range(0, 64).Select(_ => budget.Invoke(Context(services), _ => endpoint.Task)).ToArray();
        var rejected = Context(services);
        await budget.Invoke(rejected, _ => Task.CompletedTask);
        Assert.Equal(429, rejected.Response.StatusCode);
        Assert.Equal(64, authentication.Calls);
        authentication.Hold.SetResult();
        for (var i=0;i<100 && authentication.Calls==64;i++)
        {
            await Task.Delay(10);
            await budget.Invoke(Context(services), _ => Task.CompletedTask);
        }
        Assert.Equal(65, authentication.Calls);
        endpoint.SetResult();
        await Task.WhenAll(pending);
    }
}
