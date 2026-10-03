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
    [Fact]
    public async Task ServerRenameRequiresAdminAndIsVisibleToMembers()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        var owner=await Member(app,email);var member=await Member(app);
        using var o=owner.Client;using var m=member.Client;
        const string route="/api/v1/chat/workspace";
        Assert.Equal(HttpStatusCode.Forbidden,(await m.PutAsJsonAsync(route,new{name="Denied"})).StatusCode);
        await using var db=fixture.Database();
        await db.WorkspaceMembers.Where(w=>w.UserId==member.Id).ExecuteUpdateAsync(s=>s.SetProperty(w=>w.Role,Discorda.Core.Workspaces.MemberRole.Moderator));
        Assert.Equal(HttpStatusCode.Forbidden,(await m.PutAsJsonAsync(route,new{name="Denied"})).StatusCode);
        await db.WorkspaceMembers.Where(w=>w.UserId==member.Id).ExecuteUpdateAsync(s=>s.SetProperty(w=>w.Role,Discorda.Core.Workspaces.MemberRole.Admin));
        (await m.PutAsJsonAsync(route,new{name="Nome do administrador"})).EnsureSuccessStatusCode();
        Assert.Equal("Nome do administrador",(await o.GetFromJsonAsync<JsonElement>(route)).GetProperty("name").GetString());
        foreach(var invalid in new[]{"",new string('x',81),"Hidden\u200bname"})
            Assert.Equal(HttpStatusCode.BadRequest,(await o.PutAsJsonAsync(route,new{name=invalid})).StatusCode);
        (await o.PutAsJsonAsync(route,new{name="  Nosso servidor  "})).EnsureSuccessStatusCode();
        Assert.Equal("Nosso servidor",(await m.GetFromJsonAsync<JsonElement>(route)).GetProperty("name").GetString());
    }

    [Fact]
    public async Task SetupIsOwnerOnlyIdempotentAndOperationReportContainsNoSecrets()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        var owner=await Member(app,email);var member=await Member(app);
        using var o=owner.Client;using var m=member.Client;
        var name="channel-"+Guid.NewGuid().ToString("N");
        var input=new {name="Comunidade de teste",textChannels=new[]{name},voiceChannels=new[]{name+"-voice"}};
        Assert.Equal(HttpStatusCode.Forbidden,(await m.PutAsJsonAsync("/api/v1/admin/setup",input)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await m.GetAsync("/api/v1/admin/operations")).StatusCode);
        (await o.PutAsJsonAsync("/api/v1/admin/setup",input)).EnsureSuccessStatusCode();
        (await o.PutAsJsonAsync("/api/v1/admin/setup",input)).EnsureSuccessStatusCode();
        var workspace=await o.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace");
        Assert.Equal("Comunidade de teste",workspace.GetProperty("name").GetString());
        Assert.Single(workspace.GetProperty("channels").EnumerateArray(),c=>c.GetProperty("name").GetString()==name);
        Assert.Single(workspace.GetProperty("voiceChannels").EnumerateArray(),c=>c.GetProperty("name").GetString()==name+"-voice");
        Assert.Equal(HttpStatusCode.BadRequest,(await o.PutAsJsonAsync("/api/v1/admin/setup",new{name="x",textChannels=new string[11],voiceChannels=Array.Empty<string>()})).StatusCode);
        var report=await o.GetStringAsync("/api/v1/admin/operations");
        foreach(var secret in new[]{email,"password","apiSecret","connectionString"})Assert.DoesNotContain(secret,report,StringComparison.OrdinalIgnoreCase);
        var status=JsonDocument.Parse(report).RootElement;Assert.Equal("ready",status.GetProperty("database").GetString());Assert.True(status.GetProperty("storage").GetProperty("databaseBytes").GetInt64()>0);
    }
    [Fact]
    public async Task ChannelCapacityIsSharedBySetupAndManualCreationAndRetriesAreSafe()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        var owner=await Member(app,email);using var client=owner.Client;
        var name="capacity-"+Guid.NewGuid().ToString("N");
        await using var db=fixture.Database();
        var existing=await db.Channels.CountAsync(c=>c.WorkspaceId==ChatEndpoints.GroupId&&c.ArchivedAt==null);
        var channels=Enumerable.Range(0,100-existing).Select(i=>new Discorda.Core.Channels.Channel{WorkspaceId=ChatEndpoints.GroupId,Name=name+i,Type=Discorda.Core.Channels.ChannelType.Text}).ToArray();
        db.Channels.AddRange(channels);await db.SaveChangesAsync();
        try{
            var input=new{name="Capacity test",textChannels=new[]{channels[0].Name,channels[0].Name},voiceChannels=Array.Empty<string>()};
            (await client.PutAsJsonAsync("/api/v1/admin/setup",input)).EnsureSuccessStatusCode();
            Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/api/v1/chat/channels",new{name="overflow"})).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await client.PutAsJsonAsync("/api/v1/admin/setup",new{name="Overflow",textChannels=new[]{"overflow"},voiceChannels=Array.Empty<string>()})).StatusCode);
            Assert.Equal("Capacity test",(await client.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace")).GetProperty("name").GetString());
        }finally{var ids=channels.Select(c=>c.Id).ToArray();await db.Channels.Where(c=>ids.Contains(c.Id)).ExecuteDeleteAsync();}
    }

    [Fact]
    public async Task ConcurrentMembersBehindOneIpDoNotShareTheirRequestBudget()
    {
        await using var app=fixture.App();
        var members=new List<HttpClient>();
        try{
            for(var i=0;i<15;i++)members.Add((await Member(app)).Client);
            var channelId=Guid.NewGuid();
            await using var db=fixture.Database();
            var author=await db.Users.Select(u=>u.Id).FirstAsync();
            db.Channels.Add(new Discorda.Core.Channels.Channel{Id=channelId,WorkspaceId=ChatEndpoints.GroupId,Name="Load test",Type=Discorda.Core.Channels.ChannelType.Text});
            await db.SaveChangesAsync();
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.messages (\"ChannelId\",\"AuthorId\",\"ClientId\",\"Body\",\"CreatedAt\",\"Version\") SELECT {channelId},{author},gen_random_uuid(),'Synthetic history ' || i,now(),1 FROM generate_series(1,10000) i");
            var samples=new System.Collections.Concurrent.ConcurrentBag<double>();
            var elapsed=System.Diagnostics.Stopwatch.StartNew();
            var responses=await Task.WhenAll(members.Select(async client=>{
                var statuses=new List<HttpStatusCode>();
                for(var i=0;i<10;i++){var timer=System.Diagnostics.Stopwatch.StartNew();using var response=await client.GetAsync($"/api/v1/chat/channels/{channelId}/messages");samples.Add(timer.Elapsed.TotalMilliseconds);statuses.Add(response.StatusCode);}
                return statuses;
            }));
            Assert.All(responses.SelectMany(s=>s),s=>Assert.Equal(HttpStatusCode.OK,s));
            var sorted=samples.Order().ToArray();
            Console.WriteLine($"Local concurrency: 15 members, 150 authenticated history requests, 10000 stored messages, {elapsed.ElapsedMilliseconds} ms total, p50={sorted[74]:F1} ms, p95={sorted[142]:F1} ms; Supabase identity stub, real PostgreSQL.");
            await db.Messages.Where(m=>m.ChannelId==channelId).ExecuteDeleteAsync();
            await db.Channels.Where(c=>c.Id==channelId).ExecuteDeleteAsync();
        }finally{foreach(var client in members)client.Dispose();}
    }

    [Fact]
    public async Task OperationsCoalescesConcurrentProbes()
    {
        var cache=new Discorda.Api.Admin.OperationsCache();var calls=0;
        var results=await Task.WhenAll(Enumerable.Range(0,20).Select(_=>cache.Get(async()=>{Interlocked.Increment(ref calls);await Task.Delay(20);return (object)new{ok=true};},CancellationToken.None)));
        Assert.Equal(1,calls);Assert.All(results,item=>Assert.Same(results[0],item));
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
