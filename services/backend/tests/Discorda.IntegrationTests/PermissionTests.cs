using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Discorda.Api.Admin;
using Discorda.Api.Chat;
using Discorda.Core.Users;
using Discorda.Core.Workspaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Discorda.IntegrationTests;

public sealed class PermissionTests(AuthFixture fixture):IClassFixture<AuthFixture>
{
    private static readonly Guid General=Guid.Parse("225a47d7-779e-4992-89d2-03b1517f9112");
    [Fact]
    public async Task MemberCardsExposeAccountNameAndOrderedRolesWithoutEmailOrAuthorityFlags()
    {
        var email=Guid.NewGuid()+"@example.test";using var app=App(email);var owner=await Member(app,email);var person=await Member(app);
        var lower=await Role(owner.Client,"Base "+Guid.NewGuid().ToString("N")[..6],position:5);
        var higher=await Role(owner.Client,"Equipe "+Guid.NewGuid().ToString("N")[..6],position:30);
        await Assign(owner.Client,person.Id,lower,higher);
        (await person.Client.PutAsJsonAsync("/api/v1/chat/profile",new EditProfile("Apelido no servidor"))).EnsureSuccessStatusCode();
        var entries=await owner.Client.GetFromJsonAsync<JsonElement>($"/api/v1/chat/members?channelId={General}");
        var card=entries.EnumerateArray().Single(m=>m.GetProperty("id").GetGuid()==person.Id);
        Assert.Equal("Apelido no servidor",card.GetProperty("name").GetString());Assert.Equal("Friend",card.GetProperty("accountName").GetString());
        Assert.False(card.TryGetProperty("email",out _));var roles=card.GetProperty("roles").EnumerateArray().ToArray();
        Assert.Equal(new[]{higher,lower},roles.Select(r=>r.GetProperty("id").GetGuid()));Assert.False(roles[0].TryGetProperty("permissions",out _));
    }
    private WebApplicationFactory<Program> App(string email)=>fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
    private async Task<(HttpClient Client,Guid Id,string Token)> Member(WebApplicationFactory<Program> app,string? email=null)
    {
        email??=Guid.NewGuid()+"@example.test";await using var db=fixture.Database();db.AllowedUsers.Add(new AllowedUser{NormalizedEmail=email});await db.SaveChangesAsync();
        var token=fixture.Token(Guid.NewGuid(),Guid.NewGuid(),email);var client=app.CreateClient();client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
        var workspace=await client.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace");return(client,workspace.GetProperty("userId").GetGuid(),token);
    }
    private static async Task<Guid> Role(HttpClient client,string name,Permission flags=Permission.None,int position=10)
    {
        var response=await client.PostAsJsonAsync("/api/v1/chat/permissions/roles",new PermissionEndpoints.RoleInput(name,"#a6b2ff",position,(long)flags));response.EnsureSuccessStatusCode();return(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static async Task Assign(HttpClient client,Guid user,params Guid[] ids)
    {
        var data=await client.GetFromJsonAsync<JsonElement>("/api/v1/chat/permissions");var member=data.GetProperty("members").EnumerateArray().Single(m=>m.GetProperty("id").GetGuid()==user);
        (await client.PutAsJsonAsync($"/api/v1/chat/permissions/members/{user}",new PermissionEndpoints.AssignmentInput(ids,member.GetProperty("version").GetInt64()))).EnsureSuccessStatusCode();
    }
    private static async Task<Guid> NewChannel(HttpClient owner,string type="text")
    {
        var response=await owner.PostAsJsonAsync("/api/v1/chat/channels",new NewChannel("restrito-"+Guid.NewGuid().ToString("N")[..8],type));response.EnsureSuccessStatusCode();return(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static async Task<Guid> Everyone(HttpClient owner)=>(await owner.GetFromJsonAsync<JsonElement>("/api/v1/chat/permissions")).GetProperty("roles").EnumerateArray().Single(r=>r.GetProperty("isEveryone").GetBoolean()).GetProperty("id").GetGuid();
    private static async Task Rule(HttpClient owner,Guid channel,string type,Guid target,Permission allow,Permission deny)
    {
        var data=await owner.GetFromJsonAsync<JsonElement>($"/api/v1/chat/channels/{channel}/permissions");
        var current=data.GetProperty("overwrites").EnumerateArray().FirstOrDefault(r=>r.GetProperty(type=="role"?"roleId":"userId").ValueKind==JsonValueKind.String&&r.GetProperty(type=="role"?"roleId":"userId").GetGuid()==target);
        var version=current.ValueKind==JsonValueKind.Undefined?0:current.GetProperty("version").GetInt64();
        (await owner.PutAsJsonAsync($"/api/v1/chat/channels/{channel}/permissions",new PermissionEndpoints.OverwriteInput(type,target,(long)allow,(long)deny,version))).EnsureSuccessStatusCode();
    }
    [Fact]
    public async Task PrivateChannelsFilterHistoryAttachmentsWorkspaceAndPeopleAndIndividualRulesTakePrecedence()
    {
        var email=Guid.NewGuid()+"@example.test";await using var app=App(email);var owner=await Member(app,email);var allowed=await Member(app);var denied=await Member(app);
        using var a=owner.Client;using var b=allowed.Client;using var c=denied.Client;
        var channel=await NewChannel(a);var everyone=await Everyone(a);var role=await Role(a,"Equipe "+Guid.NewGuid().ToString("N")[..6]);
        await Assign(a,allowed.Id,role);await Rule(a,channel,"role",everyone,Permission.None,Permission.ViewChannel);await Rule(a,channel,"role",role,Permission.ViewChannel,Permission.None);
        var upload=await a.PostAsJsonAsync($"/api/v1/chat/channels/{channel}/attachments",new UploadAttachment(Guid.NewGuid(),"secret.txt","c2VjcmV0"));upload.EnsureSuccessStatusCode();
        var message=await upload.Content.ReadFromJsonAsync<JsonElement>();var attachment=message.GetProperty("attachments")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK,(await b.GetAsync($"/api/v1/chat/channels/{channel}/messages")).StatusCode);
        foreach(var path in new[]{"messages","messages/"+message.GetProperty("id").GetString(),"search?q=secret","pins","attachments/"+attachment})Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/v1/chat/channels/{channel}/"+path)).StatusCode);
        var workspace=await c.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace");Assert.DoesNotContain(workspace.GetProperty("channels").EnumerateArray(),x=>x.GetProperty("id").GetGuid()==channel);
        var members=await b.GetFromJsonAsync<JsonElement>($"/api/v1/chat/members?channelId={channel}");Assert.Contains(members.EnumerateArray(),m=>m.GetProperty("id").GetGuid()==allowed.Id);Assert.DoesNotContain(members.EnumerateArray(),m=>m.GetProperty("id").GetGuid()==denied.Id);
        await Rule(a,channel,"member",denied.Id,Permission.ViewChannel,Permission.SendMessages);
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync($"/api/v1/chat/channels/{channel}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.PostAsJsonAsync($"/api/v1/chat/channels/{channel}/messages",new SendMessage(Guid.NewGuid(),"blocked",null))).StatusCode);
        await Rule(a,channel,"member",allowed.Id,Permission.None,Permission.ViewChannel);
        Assert.Equal(HttpStatusCode.NotFound,(await b.GetAsync($"/api/v1/chat/channels/{channel}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await a.GetAsync($"/api/v1/chat/channels/{channel}/messages")).StatusCode);
    }
    [Fact]
    public async Task HierarchyPreventsSelfPromotionExcessGrantsAndStaleEdits()
    {
        var email=Guid.NewGuid()+"@example.test";await using var app=App(email);var owner=await Member(app,email);var manager=await Member(app);var target=await Member(app);
        using var a=owner.Client;using var b=manager.Client;using var c=target.Client;
        var role=await Role(a,"Gerente "+Guid.NewGuid().ToString("N")[..6],Permission.ManageRoles,20);await Assign(a,manager.Id,role);
        Assert.Equal(HttpStatusCode.Forbidden,(await b.PostAsJsonAsync("/api/v1/chat/permissions/roles",new PermissionEndpoints.RoleInput("Escalar","#a6b2ff",10,(long)Permission.Administrator))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await b.PutAsJsonAsync($"/api/v1/chat/permissions/members/{manager.Id}",new PermissionEndpoints.AssignmentInput([],2))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await b.PutAsJsonAsync($"/api/v1/chat/permissions/roles/{role}",new PermissionEndpoints.RoleInput("Gerente","#a6b2ff",20,0,1))).StatusCode);
        var junior=await Role(b,"Auxiliar "+Guid.NewGuid().ToString("N")[..6],Permission.ViewChannel,10);await Assign(b,target.Id,junior);
        Assert.Equal(HttpStatusCode.Conflict,(await a.PutAsJsonAsync($"/api/v1/chat/permissions/roles/{junior}",new PermissionEndpoints.RoleInput("Antigo","#a6b2ff",10,0,0))).StatusCode);
        var everyone=await Everyone(a);Assert.Equal(HttpStatusCode.Forbidden,(await a.DeleteAsync($"/api/v1/chat/permissions/roles/{everyone}?version=1")).StatusCode);
        var channel=await NewChannel(a);Assert.Equal(HttpStatusCode.BadRequest,(await a.PutAsJsonAsync($"/api/v1/chat/channels/{channel}/permissions",new PermissionEndpoints.OverwriteInput("member",target.Id,(long)Permission.Administrator,0))).StatusCode);
        var channelManager=await Role(a,"Canal "+Guid.NewGuid().ToString("N")[..6],Permission.ManagePermissions,10);await Assign(a,manager.Id,role,channelManager);
        await Rule(a,channel,"member",manager.Id,Permission.None,Permission.SendMessages);
        var policy=await b.GetFromJsonAsync<JsonElement>($"/api/v1/chat/channels/{channel}/permissions");var ownRule=policy.GetProperty("overwrites").EnumerateArray().Single(r=>r.GetProperty("userId").ValueKind==JsonValueKind.String&&r.GetProperty("userId").GetGuid()==manager.Id);
        Assert.Equal(HttpStatusCode.Forbidden,(await b.DeleteAsync($"/api/v1/chat/channels/{channel}/permissions/{ownRule.GetProperty("id").GetGuid()}?version={ownRule.GetProperty("version").GetInt64()}")).StatusCode);
    }
    private static HubConnection Connect(WebApplicationFactory<Program> app,string token)=>new HubConnectionBuilder().WithUrl(new Uri(app.Server.BaseAddress,"/api/v1/live"),options=>{options.Transports=HttpTransportType.LongPolling;options.HttpMessageHandlerFactory=_=>app.Server.CreateHandler();options.AccessTokenProvider=()=>Task.FromResult<string?>(token);}).Build();
    private static async Task<JsonElement> Wait(ChannelReader<JsonElement> reader,Func<JsonElement,bool> predicate){using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10));while(true){var item=await reader.ReadAsync(timeout.Token);if(predicate(item))return item;}}
    [Fact]
    public async Task LiveMessagesTypingAndRevocationDoNotLeakPrivateChannelEvents()
    {
        var email=Guid.NewGuid()+"@example.test";await using var app=App(email);var owner=await Member(app,email);var member=await Member(app);var outsider=await Member(app);
        using var a=owner.Client;using var b=member.Client;using var c=outsider.Client;
        var channel=await NewChannel(a);var role=await Role(a,"Privado "+Guid.NewGuid().ToString("N")[..6]);await Assign(a,member.Id,role);await Rule(a,channel,"role",await Everyone(a),Permission.None,Permission.ViewChannel);await Rule(a,channel,"role",role,Permission.ViewChannel,Permission.None);
        await using var admitted=Connect(app,member.Token);await using var hidden=Connect(app,outsider.Token);var received=Channel.CreateUnbounded<JsonElement>();var outside=Channel.CreateUnbounded<JsonElement>();var log=new ConcurrentQueue<JsonElement>();
        admitted.On<JsonElement>("ChatEvent",e=>received.Writer.TryWrite(e));hidden.On<JsonElement>("ChatEvent",e=>{log.Enqueue(e);outside.Writer.TryWrite(e);});await admitted.StartAsync();await hidden.StartAsync();
        await admitted.InvokeAsync("Pulse",channel,true,false);
        var secret="secret-"+Guid.NewGuid();(await a.PostAsJsonAsync($"/api/v1/chat/channels/{channel}/messages",new SendMessage(Guid.NewGuid(),secret,null))).EnsureSuccessStatusCode();
        await Wait(received.Reader,e=>e.GetProperty("kind").GetString()=="message"&&e.GetProperty("data").GetProperty("body").GetString()==secret);
        var barrier="public-"+Guid.NewGuid();(await a.PostAsJsonAsync($"/api/v1/chat/channels/{General}/messages",new SendMessage(Guid.NewGuid(),barrier,null))).EnsureSuccessStatusCode();
        await Wait(outside.Reader,e=>e.GetProperty("kind").GetString()=="message"&&e.GetProperty("data").GetProperty("body").GetString()==barrier);
        Assert.DoesNotContain(log,e=>e.GetRawText().Contains(secret)||e.GetRawText().Contains(channel.ToString()));
        await Assign(a,member.Id);var revoked="revoked-"+Guid.NewGuid();(await a.PostAsJsonAsync($"/api/v1/chat/channels/{channel}/messages",new SendMessage(Guid.NewGuid(),revoked,null))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound,(await b.GetAsync($"/api/v1/chat/channels/{channel}/messages")).StatusCode);
        barrier="public-"+Guid.NewGuid();(await a.PostAsJsonAsync($"/api/v1/chat/channels/{General}/messages",new SendMessage(Guid.NewGuid(),barrier,null))).EnsureSuccessStatusCode();
        var next=await Wait(received.Reader,e=>e.GetProperty("kind").GetString()=="message"&&(e.GetProperty("data").GetProperty("body").GetString()==barrier||e.GetProperty("data").GetProperty("body").GetString()==revoked));Assert.Equal(barrier,next.GetProperty("data").GetProperty("body").GetString());
    }
    [Fact]
    public async Task QueuedWriteRechecksPermissionsAfterRevocationCommits()
    {
        var email=Guid.NewGuid()+"@example.test";await using var app=App(email);var owner=await Member(app,email);var member=await Member(app);using var a=owner.Client;using var b=member.Client;
        var channel=await NewChannel(a);await using var db=fixture.Database();await using var tx=await db.Database.BeginTransactionAsync();await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891322)");
        var pending=b.PostAsJsonAsync($"/api/v1/chat/channels/{channel}/messages",new SendMessage(Guid.NewGuid(),"must not commit",null));
        db.ChannelPermissionOverwrites.Add(new(){ChannelId=channel,UserId=member.Id,Deny=Permission.SendMessages});await db.SaveChangesAsync();await tx.CommitAsync();
        Assert.Equal(HttpStatusCode.Forbidden,(await pending).StatusCode);Assert.False(await db.Messages.AnyAsync(m=>m.ChannelId==channel));
    }
}
