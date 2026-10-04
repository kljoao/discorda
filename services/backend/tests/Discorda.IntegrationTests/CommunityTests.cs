using Microsoft.Extensions.DependencyInjection;
using Discorda.Api.Media;
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
    [Fact]
    public async Task FilteredSearchHonorsAuthorDatesFilesAndArchivedChannels()
    {
        await using var app=fixture.App();var person=await Member(app);using var client=person.Client;
        var name=Guid.NewGuid().ToString("N")+".pdf";
        var upload=await client.PostAsJsonAsync(Tools+"/attachments",new{clientId=Guid.NewGuid(),name,content="aGVsbG8="});upload.EnsureSuccessStatusCode();
        var message=(await upload.Content.ReadFromJsonAsync<MessageView>())!;
        var context=await client.GetFromJsonAsync<JsonElement>(Messages+"/"+message.Id+"/context");
        Assert.Contains(context.GetProperty("items").EnumerateArray(),m=>m.GetProperty("id").GetString()==message.Id);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync($"/api/v1/chat/channels/{Guid.NewGuid()}/messages/{message.Id}/context")).StatusCode);
        var today=DateTimeOffset.UtcNow.ToString("yyyy-MM-dd");
        var search=Tools+$"/search?q={name}&author={person.Id}&after={today}&until={today}&fileType=document";
        var result=await client.GetFromJsonAsync<JsonElement>(search);Assert.Single(result.GetProperty("items").EnumerateArray());Assert.Equal(message.Id,result.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(Tools+$"/search?q={name}&author={Guid.NewGuid()}")).GetProperty("items").EnumerateArray());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(Tools+$"/search?q={name}&fileType=image")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest,(await client.GetAsync(Tools+"/search?fileType=executable")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.GetAsync(Tools+"/search?after=2026-02-31")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.GetAsync(Tools+"/search?after=2026-02-02&until=2026-02-01")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync($"/api/v1/chat/channels/{Guid.NewGuid()}/search?fileType=any")).StatusCode);
        (await client.DeleteAsync(Messages+"/"+message.Id+"?version=1")).EnsureSuccessStatusCode();
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(search)).GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task OverviewDoesNotConsumeInboxOrChannelReads()
    {
        await using var app=fixture.App();var a=await Member(app);var b=await Member(app);
        using var sender=a.Client;using var reader=b.Client;
        (await sender.PostAsJsonAsync(Messages,new{clientId=Guid.NewGuid(),body=$"Volte <@{b.Id}>"})).EnsureSuccessStatusCode();
        var before=await reader.GetFromJsonAsync<Dictionary<string,string>>("/api/v1/chat/reads");
        var summary=await reader.GetFromJsonAsync<JsonElement>("/api/v1/chat/catch-up");
        Assert.Contains(summary.GetProperty("channels").EnumerateArray(),c=>c.GetProperty("id").GetGuid()==Channel);
        var after=await reader.GetFromJsonAsync<Dictionary<string,string>>("/api/v1/chat/reads");
        Assert.Equal(before!.OrderBy(p=>p.Key),after!.OrderBy(p=>p.Key));
        Assert.NotEmpty((await reader.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox?unread=true")).GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task InvitationsReserveOneUseAndRequireOwnerApprovalBeforeMembership()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        var owner=await Member(app,email);using var admin=owner.Client;var member=await Member(app);using var ordinary=member.Client;
        Assert.Equal(HttpStatusCode.Forbidden,(await ordinary.PostAsJsonAsync("/api/v1/admin/invites",new{hours=24,maxUses=1})).StatusCode);
        var created=await admin.PostAsJsonAsync("/api/v1/admin/invites",new{hours=24,maxUses=1});created.EnsureSuccessStatusCode();
        var invite=await created.Content.ReadFromJsonAsync<JsonElement>();var token=invite.GetProperty("token").GetString();
        using var outsider=app.CreateClient();var outsiderEmail=Guid.NewGuid()+"@example.test";
        outsider.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",fixture.Token(Guid.NewGuid(),Guid.NewGuid(),outsiderEmail));
        Assert.Equal(HttpStatusCode.Forbidden,(await outsider.GetAsync("/api/v1/chat/workspace")).StatusCode);
        for(var i=0;i<2;i++){var result=await outsider.PostAsJsonAsync("/api/v1/auth/join-request",new{token});result.EnsureSuccessStatusCode();Assert.Equal("pending",(await result.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());}
        using var second=app.CreateClient();second.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",fixture.Token(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid()+"@example.test"));
        Assert.Equal(HttpStatusCode.Conflict,(await second.PostAsJsonAsync("/api/v1/auth/join-request",new{token})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await outsider.GetAsync(Messages)).StatusCode);
        var pending=await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/join-requests");var request=pending.EnumerateArray().Single(r=>r.GetProperty("email").GetString()==outsiderEmail).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Forbidden,(await ordinary.PutAsJsonAsync($"/api/v1/admin/join-requests/{request}",new{approve=true})).StatusCode);
        (await admin.PutAsJsonAsync($"/api/v1/admin/join-requests/{request}",new{approve=true})).EnsureSuccessStatusCode();
        (await outsider.GetAsync("/api/v1/chat/workspace")).EnsureSuccessStatusCode();
        var listing=await admin.GetStringAsync("/api/v1/admin/invites");Assert.DoesNotContain(token!,listing);
    }

    [Fact]
    public async Task RevokedInvitesRejectNewRequestsAndPendingApproval()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        using var admin=(await Member(app,email)).Client;
        var created=await (await admin.PostAsJsonAsync("/api/v1/admin/invites",new{hours=1,maxUses=5})).Content.ReadFromJsonAsync<JsonElement>();
        var token=created.GetProperty("token").GetString();using var outsider=app.CreateClient();var email2=Guid.NewGuid()+"@example.test";outsider.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",fixture.Token(Guid.NewGuid(),Guid.NewGuid(),email2));
        (await outsider.PostAsJsonAsync("/api/v1/auth/join-request",new{token})).EnsureSuccessStatusCode();
        var request=(await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/join-requests")).EnumerateArray().Single(r=>r.GetProperty("email").GetString()==email2).GetProperty("id").GetGuid();
        (await admin.DeleteAsync("/api/v1/admin/invites/"+created.GetProperty("id").GetString())).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound,(await outsider.PostAsJsonAsync("/api/v1/auth/join-request",new{token})).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await admin.PutAsJsonAsync($"/api/v1/admin/join-requests/{request}",new{approve=true})).StatusCode);
        (await admin.PutAsJsonAsync($"/api/v1/admin/join-requests/{request}",new{approve=false})).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task StorageCleanupRequiresExactPreviewAndPreservesRecentFiles()
    {
        var email=Guid.NewGuid()+"@example.test";
        await using var app=fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=email})));
        using var admin=(await Member(app,email)).Client;using var member=(await Member(app)).Client;
        Assert.Equal(HttpStatusCode.Forbidden,(await member.GetAsync("/api/v1/admin/storage/policy")).StatusCode);
        var policy=await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/storage/policy");
        (await admin.PutAsJsonAsync("/api/v1/admin/storage/policy",new{quotaMiB=512,retentionDays=30,version=policy.GetProperty("version").GetInt32()})).EnsureSuccessStatusCode();
        var old=await (await admin.PostAsJsonAsync(Tools+"/attachments",new{clientId=Guid.NewGuid(),name="old.txt",content="aGVsbG8="})).Content.ReadFromJsonAsync<JsonElement>();var oldId=long.Parse(old.GetProperty("id").GetString()!);
        var recent=await (await admin.PostAsJsonAsync(Tools+"/attachments",new{clientId=Guid.NewGuid(),name="recent.txt",content="aGVsbG8="})).Content.ReadFromJsonAsync<JsonElement>();var recentId=long.Parse(recent.GetProperty("id").GetString()!);
        await using var db=fixture.Database();await db.Messages.Where(m=>m.Id==oldId).ExecuteUpdateAsync(s=>s.SetProperty(m=>m.CreatedAt,DateTimeOffset.UtcNow.AddDays(-40)));
        var preview=await (await admin.PostAsJsonAsync("/api/v1/admin/storage/preview",new{})).Content.ReadFromJsonAsync<JsonElement>();Assert.Equal(1,preview.GetProperty("count").GetInt32());Assert.Equal(5,preview.GetProperty("bytes").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict,(await admin.PostAsJsonAsync("/api/v1/admin/storage/cleanup",new{cutoff=preview.GetProperty("cutoff").GetString(),fingerprint="changed"})).StatusCode);
        (await admin.PostAsJsonAsync("/api/v1/admin/storage/cleanup",new{cutoff=preview.GetProperty("cutoff").GetString(),fingerprint=preview.GetProperty("fingerprint").GetString()})).EnsureSuccessStatusCode();
        Assert.False(await db.MessageAttachments.AnyAsync(a=>a.MessageId==oldId));Assert.True(await db.MessageAttachments.AnyAsync(a=>a.MessageId==recentId));
        policy=await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/storage/policy");(await admin.PutAsJsonAsync("/api/v1/admin/storage/policy",new{quotaMiB=512,retentionDays=0,version=policy.GetProperty("version").GetInt32()})).EnsureSuccessStatusCode();
    }
    [Fact]
    public async Task InboxIsPrivateIdempotentAndReadStateSurvivesReconnect()
    {
        await using var app = fixture.App(); var a = await Member(app); var b = await Member(app); var c = await Member(app);
        using var sender = a.Client; using var recipient = b.Client; using var stranger = c.Client;
        var payload = new { clientId = Guid.NewGuid(), body = $"Olá <@{b.Id}>" };
        var response = await sender.PostAsJsonAsync(Messages, payload); response.EnsureSuccessStatusCode();
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();
        (await sender.PostAsJsonAsync(Messages, payload)).EnsureSuccessStatusCode();
        var inbox = await recipient.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox?unread=true");
        Assert.Single(inbox.GetProperty("items").EnumerateArray());
        Assert.Equal(id, inbox.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Empty((await stranger.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox")).GetProperty("items").EnumerateArray());
        (await stranger.PutAsync($"/api/v1/chat/inbox/{id}/read", null)).EnsureSuccessStatusCode();
        Assert.Single((await recipient.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox?unread=true")).GetProperty("items").EnumerateArray());
        (await recipient.PutAsync($"/api/v1/chat/inbox/{id}/read", null)).EnsureSuccessStatusCode();
        Assert.Empty((await recipient.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox?unread=true")).GetProperty("items").EnumerateArray());
        Assert.True((await recipient.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox")).GetProperty("items")[0].GetProperty("read").GetBoolean());
        (await sender.DeleteAsync(Messages + "/" + id + "?version=1")).EnsureSuccessStatusCode();
        Assert.Empty((await recipient.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox")).GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task FollowedThreadsNotifyUntilUnfollowedAndRespectChannel()
    {
        await using var app = fixture.App(); var a = await Member(app); var b = await Member(app);
        using var sender = a.Client; using var follower = b.Client;
        var root = await (await sender.PostAsJsonAsync(Messages, new { clientId = Guid.NewGuid(), body = "Root" })).Content.ReadFromJsonAsync<JsonElement>();
        var rootId = root.GetProperty("id").GetString(); var follow = Tools + "/threads/" + rootId + "/follow";
        (await follower.PutAsJsonAsync(follow, new { enabled = true })).EnsureSuccessStatusCode();
        Assert.True((await follower.GetFromJsonAsync<JsonElement>(follow)).GetProperty("enabled").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await follower.GetAsync($"/api/v1/chat/channels/{Guid.NewGuid()}/threads/{rootId}/follow")).StatusCode);
        (await sender.PostAsJsonAsync(Messages, new { clientId = Guid.NewGuid(), body = "Followed answer", threadRootId = rootId })).EnsureSuccessStatusCode();
        var inbox = await follower.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox");
        Assert.Single(inbox.GetProperty("items").EnumerateArray());
        Assert.Equal("thread", inbox.GetProperty("items")[0].GetProperty("kind").GetString());
        (await follower.PutAsJsonAsync(follow, new { enabled = false })).EnsureSuccessStatusCode();
        (await sender.PostAsJsonAsync(Messages, new { clientId = Guid.NewGuid(), body = "Not followed", threadRootId = rootId })).EnsureSuccessStatusCode();
        Assert.Single((await follower.GetFromJsonAsync<JsonElement>("/api/v1/chat/inbox")).GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task AttachmentStorageManagementRequiresOwnerAndRevokesDownload()
    {
        var email = Guid.NewGuid() + "@example.test";
        await using var app = fixture.App().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Admin:Email"] = email })));
        var a = await Member(app, email); var b = await Member(app); using var owner = a.Client; using var member = b.Client;
        var result = await member.PostAsJsonAsync(Tools + "/attachments", new { clientId = Guid.NewGuid(), name = "storage.txt", content = "aGVsbG8=" }); result.EnsureSuccessStatusCode();
        var id = (await result.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("attachments")[0].GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/v1/admin/attachments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.DeleteAsync("/api/v1/admin/attachments/" + id)).StatusCode);
        var page = await owner.GetFromJsonAsync<JsonElement>("/api/v1/admin/attachments");
        Assert.Contains(page.GetProperty("items").EnumerateArray(), item => item.GetProperty("id").GetString() == id);
        (await owner.DeleteAsync("/api/v1/admin/attachments/" + id)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync(Tools + "/attachments/" + id)).StatusCode);
    }
    [Fact]
    public async Task AttachmentLimitsAndThreadRootChannelAreEnforced()
    {
        await using var app = fixture.App(); var member = await Member(app); using var client = member.Client;
        var route = Tools + "/attachments";
        var file = await client.PostAsJsonAsync(route, new { clientId = Guid.NewGuid(), name = "large.txt", content = Convert.ToBase64String(new byte[100000]) });
        file.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(route, new { clientId = Guid.NewGuid(), name = "too-large.txt", content = Convert.ToBase64String(new byte[Attachments.MaxBytes + 1]) })).StatusCode);
        await using var db = fixture.Database();
        var another = new Discorda.Core.Channels.Channel { WorkspaceId = ChatEndpoints.GroupId, Name = "Other channel", Type = Discorda.Core.Channels.ChannelType.Text };
        db.Channels.Add(another); await db.SaveChangesAsync();
        var parent = new Discorda.Core.Channels.Message { ChannelId = another.Id, AuthorId = member.Id, ClientId = Guid.NewGuid(), Body = "Other root" };
        db.Messages.Add(parent); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Messages, new { clientId = Guid.NewGuid(), body = "Wrong channel", threadRootId = parent.Id })).StatusCode);
    }
    [Fact]
    public async Task ThreadRepliesAreScopedPaginatedAndDoNotPolluteMainHistory()
    {
        await using var app = fixture.App(); var member = await Member(app); using var client = member.Client;
        var root = await (await client.PostAsJsonAsync(Messages, new { clientId = Guid.NewGuid(), body = "Thread root" })).Content.ReadFromJsonAsync<JsonElement>();
        var rootId = root.GetProperty("id").GetString(); var retryId = Guid.NewGuid();
        var payload = new { clientId = retryId, body = "Thread answer", threadRootId = rootId };
        var response = await client.PostAsJsonAsync(Messages, payload); response.EnsureSuccessStatusCode();
        var reply = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(member.Id, reply.GetProperty("replyAuthorId").GetGuid());
        Assert.Equal(rootId, reply.GetProperty("threadRootId").GetString());
        var retry = await (await client.PostAsJsonAsync(Messages, payload)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(reply.GetProperty("id").GetString(), retry.GetProperty("id").GetString());
        var main = await client.GetFromJsonAsync<JsonElement>(Messages);
        Assert.DoesNotContain(main.GetProperty("items").EnumerateArray(), m => m.GetProperty("id").GetString() == reply.GetProperty("id").GetString());
        Assert.Equal(1, main.GetProperty("items").EnumerateArray().Single(m => m.GetProperty("id").GetString() == rootId).GetProperty("threadReplyCount").GetInt32());
        var thread = await client.GetFromJsonAsync<JsonElement>(Messages + "?thread=" + rootId);
        Assert.Single(thread.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Messages, new { clientId = Guid.NewGuid(), body = "nested", threadRootId = reply.GetProperty("id").GetString() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(Messages, new { clientId = retryId, body = "same id different topic" })).StatusCode);
    }
    [Fact]
    public async Task AttachmentsRequireAccessAndDeletionRevokesDownload()
    {
        await using var app = fixture.App(); var owner = await Member(app); var other = await Member(app);
        using var client = owner.Client; using var another = other.Client;
        var route = Tools + "/attachments";
        var payload = new { clientId = Guid.NewGuid(), name = "example.txt", content = Convert.ToBase64String("hello"u8.ToArray()) };
        var response = await client.PostAsJsonAsync(route, payload); response.EnsureSuccessStatusCode();
        var message = await response.Content.ReadFromJsonAsync<JsonElement>();
        var fileId = message.GetProperty("attachments")[0].GetProperty("id").GetString();
        Assert.Equal(5, message.GetProperty("attachments")[0].GetProperty("size").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(route, new { payload.clientId, name = "changed.txt", content = payload.content })).StatusCode);
        var retry = await (await client.PostAsJsonAsync(route, payload)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(message.GetProperty("id").GetString(), retry.GetProperty("id").GetString());
        Assert.Equal("aGVsbG8=", (await another.GetFromJsonAsync<JsonElement>(route + "/" + fileId)).GetProperty("content").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await another.GetAsync($"/api/v1/chat/channels/{Guid.NewGuid()}/attachments/{fileId}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(route, new { clientId = Guid.NewGuid(), name = "../evil", content = "aGVsbG8=" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(route, new { clientId = Guid.NewGuid(), name = "file", content = "invalid!" })).StatusCode);
        var removed = await client.DeleteAsync(Messages + "/" + message.GetProperty("id").GetString() + "?version=1"); removed.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await another.GetAsync(route + "/" + fileId)).StatusCode);
        await using var db = fixture.Database(); Assert.False(await db.MessageAttachments.AnyAsync(a => a.Id == Guid.Parse(fileId!)));
    }
    [Fact]
    public async Task TemporaryRoomsLimitPerCreatorAndExpireWhenEmpty()
    {
        await using var app = fixture.App(); var member = await Member(app); using var client = member.Client;
        const string route = "/api/v1/chat/temporary-rooms";
        var first = await client.PostAsJsonAsync(route, new { name = "Test room" }); first.EnsureSuccessStatusCode();
        var id = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        (await client.PostAsJsonAsync(route, new { name = "Second room" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(route, new { name = "Third room" })).StatusCode);
        await using var db = fixture.Database();
        await db.Channels.Where(c => c.Id == id).ExecuteUpdateAsync(s => s.SetProperty(c => c.EmptySince, DateTimeOffset.UtcNow.AddMinutes(-3)));
        await TemporaryRooms.Sweep(db, app.Services.GetRequiredService<MediaService>(), app.Services.GetRequiredService<LiveChat>(), CancellationToken.None);
        Assert.NotNull((await db.Channels.AsNoTracking().SingleAsync(c => c.Id == id)).ArchivedAt);
        (await client.PostAsJsonAsync(route, new { name = "Replacement" })).EnsureSuccessStatusCode();
    }
    [Fact]
    public async Task QueuedRoleMutationRechecksAuthorityAfterConcurrentDemotion()
    {
        await using var app = fixture.App();
        var actor = await Member(app); var target = await Member(app);
        using var client = actor.Client; using var targetClient = target.Client;
        await using var db = fixture.Database();
        await db.WorkspaceMembers.Where(m => m.UserId == actor.Id).ExecuteUpdateAsync(s => s.SetProperty(m => m.Role, Discorda.Core.Workspaces.MemberRole.Admin));
        await using var tx = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891322)");
        var pending = client.PutAsJsonAsync($"/api/v1/chat/management/members/{target.Id}/role", new {role="Moderator"});
        var waiting = false;
        for (var i=0; i<100 && !waiting; i++)
        {
            await db.Database.ExecuteSqlRawAsync("SELECT pg_stat_clear_snapshot()");
            waiting = await db.Database.SqlQueryRaw<int>("SELECT 1 AS \"Value\" FROM pg_stat_activity WHERE wait_event = 'advisory' AND query LIKE '%74891322%'").AnyAsync();
            if (!waiting) await Task.Delay(20);
        }
        Assert.True(waiting, "Mutation must wait before making its authorization decision");
        await db.WorkspaceMembers.Where(m => m.UserId == actor.Id).ExecuteUpdateAsync(s => s.SetProperty(m => m.Role, Discorda.Core.Workspaces.MemberRole.Member));
        await tx.CommitAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await pending).StatusCode);
        Assert.Equal(Discorda.Core.Workspaces.MemberRole.Member, await db.WorkspaceMembers.Where(m => m.UserId == target.Id).Select(m => m.Role).SingleAsync());
    }
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
        var compatibility=await o.GetFromJsonAsync<JsonElement>("/api/v1/compatibility");Assert.Equal(1,compatibility.GetProperty("protocol").GetInt32());
        var status=JsonDocument.Parse(report).RootElement;Assert.Equal(1,status.GetProperty("versions").GetProperty("protocol").GetInt32());Assert.StartsWith("17.",status.GetProperty("versions").GetProperty("database").GetString());Assert.Equal("ready",status.GetProperty("database").GetString());Assert.True(status.GetProperty("storage").GetProperty("databaseBytes").GetInt64()>0);
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
