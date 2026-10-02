using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Discorda.IntegrationTests;

public sealed class ProxyTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    [Theory]
    [InlineData("192.0.2.10", "198.51.100.20", "https")]
    [InlineData("192.0.2.11", "192.0.2.11", "http")]
    public async Task OnlyTheConfiguredProxyCanForwardClientAddressAndScheme(string peer, string expected, string scheme)
    {
        await using var app = fixture.App().WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Proxy:TrustedIp"] = "192.0.2.10" })));
        using var client = app.CreateClient();
        var result = await app.Server.SendAsync(context => {
            context.Connection.RemoteIpAddress = IPAddress.Parse(peer);
            context.Request.Method = "GET";
            context.Request.Path = "/health/live";
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.20";
            context.Request.Headers["X-Forwarded-Proto"] = "https";
        });
        Assert.Equal(200, result.Response.StatusCode);
        Assert.Equal(expected, result.Connection.RemoteIpAddress!.ToString());
        Assert.Equal(scheme, result.Request.Scheme);
    }
}
