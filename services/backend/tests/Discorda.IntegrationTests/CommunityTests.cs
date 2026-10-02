using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Discorda.Api.Chat;
using Discorda.Core.Users;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;

namespace Discorda.IntegrationTests;

public sealed class CommunityTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private static readonly Guid Channel = Guid.Parse("225a47d7-779e-4992-89d2-03b1517f9112");
    private static string Messages => $"/api/v1/chat/channels/{Channel}/messages";
    private static string Tools => $"/api/v1/chat/channels/{Channel}";
    private async Task<(HttpClient Client, Guid Id)> Member(WebApplicationFactory<Program> app, string? email = null)
    {
        email ??= Guid.NewGuid()+"@example.test";
        await using var db=fixture.Database();db.AllowedUsers.Add(new AllowedUser{NormalizedEmail=email});await db.SaveChangesAsync();
        var client=app.CreateClient();client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",fixture.Token(Guid.NewGuid(),Guid.NewGuid(),email));
        var workspace=await client.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace");return (client,workspace.GetProperty("userId").GetGuid());
    }
    [Theory]
    [InlineData("role; DROP SCHEMA discorda CASCADE")]
    [InlineData("role\"; GRANT ALL ON SCHEMA discorda TO PUBLIC;--")]
    [InlineData("role name")]
    [InlineData("role\n")]
    public void MigrationIdentifiersRejectInjection(string role)
    {
        Assert.Throws<ArgumentException>(() => Discorda.Infrastructure.Persistence.RuntimeDatabasePermissions.GrantSql(role));
    }
    [Fact]
    public async Task RolesCannotEscalateAndRevocationTakesEffectWithoutReload()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        var owner=await Member(app,email);var admin=await Member(app);var moderator=await Member(app);var member=await Member(app);
        using var o=owner.Client;using var a=admin.Client;using var mod=moderator.Client;using var m=member.Client;
        string Role(Guid id)=>$"/api/v1/chat/management/members/{id}/role";
        Assert.Equal(HttpStatusCode.Forbidden,(await m.PutAsJsonAsync(Role(member.Id),new{role="Admin"})).StatusCode);
        (await o.PutAsJsonAsync(Role(admin.Id),new{role="Admin"})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden,(await a.PutAsJsonAsync(Role(owner.Id),new{role="Member"})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await a.PutAsJsonAsync(Role(member.Id),new{role="Owner"})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await a.PutAsJsonAsync(Role(member.Id),new{role="Admin"})).StatusCode);
        (await a.PutAsJsonAsync(Role(moderator.Id),new{role="Moderator"})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden,(await mod.PostAsJsonAsync("/api/v1/chat/channels",new{name="forbidden"})).StatusCode);
        var sent=(await m.PostAsJsonAsync(Messages,new SendMessage(Guid.NewGuid(),"moderated",null)));sent.EnsureSuccessStatusCode();var message=(await sent.Content.ReadFromJsonAsync<MessageView>())!;
        (await mod.DeleteAsync(Messages+"/"+message.Id+"?version=1")).EnsureSuccessStatusCode();
        (await o.PutAsJsonAsync(Role(admin.Id),new{role="Member"})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden,(await a.PostAsJsonAsync("/api/v1/chat/channels",new{name="revoked"})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await mod.GetAsync("/api/v1/chat/management/audit")).StatusCode);
        var audits=await o.GetFromJsonAsync<JsonElement[]>("/api/v1/chat/management/audit");Assert.Contains(audits!,x=>x.GetProperty("action").GetString()=="message.delete");
        Assert.Equal(HttpStatusCode.Forbidden,(await mod.PostAsJsonAsync($"/api/v1/chat/management/members/{owner.Id}/voice",new{channelId=(Guid?)null})).StatusCode);
    }
    [Fact]
    public async Task SearchReactionAndReadBoundariesAreEnforcedAndReadsNeverGoBackwards()
    {
        await using var app=fixture.App();var member=await Member(app);using var client=member.Client;
        var term="pesquisavel"+Guid.NewGuid().ToString("N");
        var sent=await client.PostAsJsonAsync(Messages,new SendMessage(Guid.NewGuid(),term+" <script>alert(1)</script>",null));sent.EnsureSuccessStatusCode();var message=(await sent.Content.ReadFromJsonAsync<MessageView>())!;
        var result=await client.GetFromJsonAsync<JsonElement>(Tools+"/search?q="+term);Assert.Equal(message.Id,result.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync($"/api/v1/chat/channels/{Guid.NewGuid()}/search?q={term}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.GetAsync(Tools+"/search?q="+new string('a',121))).StatusCode);
        var reactions=await Task.WhenAll(Enumerable.Range(0,3).Select(_=>client.PutAsJsonAsync(Messages+"/"+message.Id+"/reaction",new{emoji="👍",enabled=true})));Assert.All(reactions,r=>r.EnsureSuccessStatusCode());
        var annotations=await client.GetFromJsonAsync<JsonElement>(Tools+"/annotations?ids="+message.Id);Assert.Equal(1,annotations.GetProperty("reactions")[0].GetProperty("count").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PutAsJsonAsync(Messages+"/"+message.Id+"/reaction",new{emoji="<script>",enabled=true})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsJsonAsync(Messages+"/"+message.Id+"/pin",new{enabled=true})).StatusCode);
        (await client.PutAsJsonAsync(Tools+"/read",new{messageId=long.Parse(message.Id)})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound,(await client.PutAsJsonAsync(Tools+"/read",new{messageId=long.MaxValue})).StatusCode);
        var reads=await client.GetFromJsonAsync<Dictionary<string,string>>("/api/v1/chat/reads");Assert.Equal(message.Id,reads![Channel.ToString()]);
        (await client.DeleteAsync(Messages+"/"+message.Id+"?version=1")).EnsureSuccessStatusCode();
        result=await client.GetFromJsonAsync<JsonElement>(Tools+"/search?q="+term);Assert.Empty(result.GetProperty("items").EnumerateArray());
        annotations=await client.GetFromJsonAsync<JsonElement>(Tools+"/annotations?ids="+message.Id);Assert.Empty(annotations.GetProperty("reactions").EnumerateArray());
    }
}
