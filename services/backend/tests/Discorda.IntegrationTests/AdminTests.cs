using System.Net;
using System.Text.Json;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Discorda.Core.Users;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;

namespace Discorda.IntegrationTests;

public sealed class AdminTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    [Fact]
    public async Task OnlyConfiguredVerifiedAdminCanManageAccessAndNetwork()
    {
        var admin = Guid.NewGuid() + "@example.test";
        var member = Guid.NewGuid() + "@example.test";
        var state = Path.Combine(Path.GetTempPath(), "discorda-admin-" + Guid.NewGuid());
        await using var app = fixture.App().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?> {
                ["Admin:Email"] = admin, ["SelfHost:HostIp"] = "26.10.10.1", ["SelfHost:StateDirectory"] = state
            })));
        await using (var db = fixture.Database()) {
            db.AllowedUsers.AddRange(new AllowedUser { NormalizedEmail = admin }, new AllowedUser { NormalizedEmail = member });
            await db.SaveChangesAsync();
        }
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/admin/users")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(Guid.NewGuid(), Guid.NewGuid(), member));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/v1/admin/network", new { addresses = new[] { "26.10.10.2" } })).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(Guid.NewGuid(), Guid.NewGuid(), admin));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/admin/users", new { email = admin, enabled = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/api/v1/admin/users", new { email = "new@example.test", enabled = true })).StatusCode);
        foreach (var bad in new[] { "0.0.0.0/0", "26.10.10.2;whoami", "127.0.0.1", "26.1", "26.10.10.2\nfoo" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/admin/network", new { addresses = new[] { bad } })).StatusCode);
        try {
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/v1/admin/network", new { addresses = new[] { "26.10.10.2" } })).StatusCode);
            var script = await client.GetStringAsync("/api/v1/admin/network/script");
            Assert.Contains("-RemoteAddress 26.10.10.2", script);
            Assert.DoesNotContain("-RemoteAddress Any", script);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/v1/admin/network", new { addresses = Array.Empty<string>() })).StatusCode);
            Assert.DoesNotContain("New-NetFirewallRule", await client.GetStringAsync("/api/v1/admin/network/script"));
            var settings = await client.GetStringAsync("/api/v1/admin/settings");
            Assert.DoesNotContain("password", settings, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("clientSecret", settings);
            Assert.DoesNotContain("ManagementToken", settings);
            var workspace = await client.GetStringAsync("/api/v1/chat/workspace");
            Assert.Contains("Owner", workspace);
        } finally { if (Directory.Exists(state)) Directory.Delete(state, true); }
    }
    [Fact]
    public async Task ChangingConfiguredAdminRevokesOldOwnerEvenBeforeWorkspaceRefresh()
    {
        var oldEmail=Guid.NewGuid()+"@example.test";var nextEmail=Guid.NewGuid()+"@example.test";
        var oldToken=fixture.Token(Guid.NewGuid(),Guid.NewGuid(),oldEmail);
        await using(var db=fixture.Database()){db.AllowedUsers.AddRange(new AllowedUser{NormalizedEmail=oldEmail},new AllowedUser{NormalizedEmail=nextEmail});await db.SaveChangesAsync();}
        await using var first=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=oldEmail})));
        using(var owner=first.CreateClient()){owner.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",oldToken);var workspace=await owner.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace");Assert.True(workspace.GetProperty("isAdmin").GetBoolean());}
        await using var changed=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=nextEmail})));
        using var former=changed.CreateClient();former.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",oldToken);
        Assert.Equal(HttpStatusCode.Forbidden,(await former.PostAsJsonAsync("/api/v1/chat/channels",new{name="forbidden"})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await former.PutAsJsonAsync("/api/v1/admin/users",new{email=oldEmail,enabled=true,isAdmin=true})).StatusCode);
        var oldWorkspace=await former.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace");Assert.False(oldWorkspace.GetProperty("isAdmin").GetBoolean());Assert.Equal("Member",oldWorkspace.GetProperty("role").GetString());
        using var current=changed.CreateClient();current.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",fixture.Token(Guid.NewGuid(),Guid.NewGuid(),nextEmail));
        Assert.Equal(HttpStatusCode.OK,(await current.GetAsync("/api/v1/admin/settings")).StatusCode);
    }

}
