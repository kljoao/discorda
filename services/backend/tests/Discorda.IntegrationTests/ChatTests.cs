using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Discorda.Api.Chat;
using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.IntegrationTests;

public sealed class ChatTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private async Task<HttpClient> Member(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> app, string? configuredEmail = null)
    {
        var subject = Guid.NewGuid(); var email = configuredEmail ?? subject + "@example.test";
        await using var db = fixture.Database(); db.AllowedUsers.Add(new AllowedUser { NormalizedEmail = email }); await db.SaveChangesAsync();
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(subject, Guid.NewGuid(), email));
        (await client.GetAsync("/api/v1/chat/workspace")).EnsureSuccessStatusCode();
        return client;
    }
    private static readonly Guid General = Guid.Parse("225a47d7-779e-4992-89d2-03b1517f9112");
    private static string Route(Guid channel) => $"/api/v1/chat/channels/{channel}/messages";

    [Fact]
    public async Task CustomNamePersistsAcrossAuthAndIsScopedToCurrentUser()
    {
        await using var app = fixture.App(); using var client = await Member(app); using var other = await Member(app);
        var before = await other.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        (await client.PutAsJsonAsync("/api/v1/chat/profile", new EditProfile("  Meu apelido 🎮  "))).EnsureSuccessStatusCode();
        var profile = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        Assert.Equal("Meu apelido 🎮", profile.GetProperty("displayName").GetString());
        Assert.Equal(before.GetProperty("displayName").GetString(), (await other.GetFromJsonAsync<JsonElement>("/api/v1/auth/me")).GetProperty("displayName").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/chat/profile", new EditProfile(new string('x',33)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/chat/profile", new EditProfile("bad\nname"))).StatusCode);
        await using var db = fixture.Database();
        var saved = await db.Users.SingleAsync(x => x.Id == profile.GetProperty("id").GetGuid());
        Assert.Equal("Meu apelido 🎮", saved.CustomDisplayName);
    }

    [Fact]
    public async Task ConcurrentSendIsDeduplicatedAndVersionsPreventLostUpdates()
    {
        await using var app = fixture.App(); using var client = await Member(app);
        var input = new SendMessage(Guid.NewGuid(), "Olá 🙂 https://example.com", null);
        var responses = await Task.WhenAll(client.PostAsJsonAsync(Route(General), input), client.PostAsJsonAsync(Route(General), input));
        foreach (var response in responses) response.EnsureSuccessStatusCode();
        var first = (await responses[0].Content.ReadFromJsonAsync<MessageView>())!;
        Assert.Equal(first.Id, (await responses[1].Content.ReadFromJsonAsync<MessageView>())!.Id);
        var edits = await Task.WhenAll(client.PutAsJsonAsync(Route(General) + "/" + first.Id, new EditMessage("edit A", 1)), client.PutAsJsonAsync(Route(General) + "/" + first.Id, new EditMessage("edit B", 1)));
        Assert.Single(edits, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(edits, x => x.StatusCode == HttpStatusCode.Conflict);
        (await client.DeleteAsync(Route(General) + "/" + first.Id + "?version=2")).EnsureSuccessStatusCode();
        var replay = await client.PostAsJsonAsync(Route(General), input);
        var deleted = (await replay.Content.ReadFromJsonAsync<MessageView>())!;
        Assert.NotNull(deleted.DeletedAt); Assert.Equal("", deleted.Body); Assert.Equal(3, deleted.Version);
    }

    [Fact]
    public async Task OwnershipChannelAccessAndReplyBoundariesAreEnforced()
    {
        await using var app = fixture.App(); using var owner = await Member(app); using var other = await Member(app);
        var sent = await owner.PostAsJsonAsync(Route(General), new SendMessage(Guid.NewGuid(), "private edit", null)); sent.EnsureSuccessStatusCode();
        var message = (await sent.Content.ReadFromJsonAsync<MessageView>())!;
        var response=await other.PostAsJsonAsync(Route(General),new SendMessage(Guid.NewGuid(),"reply",long.Parse(message.Id)));
        response.EnsureSuccessStatusCode();Assert.Equal(message.AuthorId,(await response.Content.ReadFromJsonAsync<MessageView>())!.ReplyAuthorId);
        Assert.Equal(HttpStatusCode.Conflict, (await other.PutAsJsonAsync(Route(General) + "/" + message.Id, new EditMessage("overwrite", 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await other.DeleteAsync(Route(General) + "/" + message.Id + "?version=1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Route(Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsJsonAsync(Route(Guid.Parse("190d597d-6a85-42b0-a855-8c85f93e4cdf")), new SendMessage(Guid.NewGuid(), "wrong channel reply", long.Parse(message.Id)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PostAsJsonAsync("/api/v1/chat/channels", new NewChannel("not-owner"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync(Route(General), new SendMessage(Guid.NewGuid(), new string('x', 4001), null))).StatusCode);
        using var anonymous = app.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Route(General))).StatusCode);
    }

    [Fact]
    public async Task HistoryUsesStableCursorAndOwnerCanCreateChannel()
    {
        var admin=Guid.NewGuid()+"@example.test";
        await using var app = fixture.App().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["Admin:Email"]=admin}))); using var client = await Member(app,admin);
        var workspace = (await client.GetFromJsonAsync<JsonElement>("/api/v1/chat/workspace"));
        var user = workspace.GetProperty("userId").GetGuid();
        await using var db = fixture.Database();
        await db.WorkspaceMembers.Where(x => x.UserId == user && x.WorkspaceId == ChatEndpoints.GroupId).ExecuteUpdateAsync(set => set.SetProperty(x => x.Role, Discorda.Core.Workspaces.MemberRole.Owner));
        var created = await client.PostAsJsonAsync("/api/v1/chat/channels", new NewChannel("paginação")); created.EnsureSuccessStatusCode();
        var channel = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        db.Messages.AddRange(Enumerable.Range(0, 55).Select(index => new Discorda.Core.Channels.Message { ChannelId = channel, AuthorId = user, ClientId = Guid.NewGuid(), Body = "line " + index }));
        await db.SaveChangesAsync();
        var first = await client.GetFromJsonAsync<JsonElement>(Route(channel));
        Assert.True(first.GetProperty("hasMore").GetBoolean()); Assert.Equal(50, first.GetProperty("items").GetArrayLength());
        var before = first.GetProperty("items")[0].GetProperty("id").GetString();
        var second = await client.GetFromJsonAsync<JsonElement>(Route(channel) + "?before=" + before);
        Assert.Equal(5, second.GetProperty("items").GetArrayLength()); Assert.False(second.GetProperty("hasMore").GetBoolean());
    }
}

