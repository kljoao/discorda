using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Discorda.Api.Chat;
using Discorda.Core.Users;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Discorda.IntegrationTests;

public sealed class LiveChatTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private static readonly Guid General = Guid.Parse("225a47d7-779e-4992-89d2-03b1517f9112");
    [Fact]
    public async Task AuthorizedClientsReceiveCommittedMessagesTypingAndRevocationDisconnects()
    {
        await using var app = fixture.App();
        var subject = Guid.NewGuid(); var session = Guid.NewGuid(); var email = subject + "@example.test";
        await using (var db = fixture.Database()) { db.AllowedUsers.Add(new AllowedUser { NormalizedEmail = email }); await db.SaveChangesAsync(); }
        var token = fixture.Token(subject, session, email);
        using var http = app.CreateClient(); http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        (await http.GetAsync("/api/v1/chat/workspace")).EnsureSuccessStatusCode();
        await using var first = new HubConnectionBuilder().WithUrl(new Uri(app.Server.BaseAddress, "/api/v1/live"), options => {
            options.Transports = HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler(); options.AccessTokenProvider = () => Task.FromResult<string?>(token);
        }).Build();
        await using var second = new HubConnectionBuilder().WithUrl(new Uri(app.Server.BaseAddress, "/api/v1/live"), options => {
            options.Transports = HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler(); options.AccessTokenProvider = () => Task.FromResult<string?>(token);
        }).Build();
        var events = Channel.CreateUnbounded<JsonElement>();
        second.On<JsonElement>("ChatEvent", item => events.Writer.TryWrite(item));
        await first.StartAsync(); await second.StartAsync();
        await first.InvokeAsync("Pulse", General, true, false);
        var presence = await Wait(events.Reader, x => x.GetProperty("kind").GetString() == "presence" && x.GetProperty("data").EnumerateArray().Any(m => m.GetProperty("typingChannelId").ValueKind == JsonValueKind.String));
        Assert.Single(presence.GetProperty("data").EnumerateArray()); // two connections, one member
        var sent = await http.PostAsJsonAsync($"/api/v1/chat/channels/{General}/messages", new SendMessage(Guid.NewGuid(), "live message", null)); sent.EnsureSuccessStatusCode();
        var message = await Wait(events.Reader, x => x.GetProperty("kind").GetString() == "message");
        var id = long.Parse(message.GetProperty("data").GetProperty("id").GetString()!);
        await using (var db = fixture.Database()) {
            Assert.True(await db.Messages.AnyAsync(x => x.Id == id));
            await db.ApplicationSessions.Where(x => x.Id == session).ExecuteUpdateAsync(set => set.SetProperty(x => x.RevokedAt, DateTimeOffset.UtcNow));
        }
        var closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        second.Closed += _ => { closed.TrySetResult(); return Task.CompletedTask; };
        await app.Services.GetRequiredService<LiveChat>().SendPresence();
        await closed.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(HubConnectionState.Disconnected, second.State);
        Assert.Equal(HttpStatusCode.Forbidden, (await http.GetAsync("/api/v1/chat/workspace")).StatusCode);
    }

    [Fact]
    public async Task AnonymousAndUnlistedUsersCannotNegotiateHub()
    {
        await using var app = fixture.App(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/live/negotiate?negotiateVersion=1", null)).StatusCode);
        var subject = Guid.NewGuid();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(subject, Guid.NewGuid(), subject + "@example.test"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/v1/live/negotiate?negotiateVersion=1", null)).StatusCode);
    }

    [Fact]
    public void PresenceLeaseExpiryAndMultipleConnectionsAreDeterministic()
    {
        var now = DateTimeOffset.UtcNow; var user = Guid.NewGuid();
        var peer = new LivePeer("a", user, Guid.NewGuid(), "Friend", now.AddMinutes(1), now, true, General, now.AddSeconds(6), () => {});
        var snapshot = LiveChat.Snapshot([peer, peer with { ConnectionId = "b", Away = false }], now);
        Assert.Single(snapshot); Assert.Equal("online", snapshot[0].Status); Assert.Equal(General, snapshot[0].TypingChannelId);
        Assert.Null(LiveChat.Snapshot([peer], now.AddSeconds(7))[0].TypingChannelId);
        Assert.Empty(LiveChat.Snapshot([peer], now.AddSeconds(46)));
        Assert.Empty(LiveChat.Snapshot([peer with { ExpiresAt = now.AddSeconds(-1) }], now));
    }

    private static async Task<JsonElement> Wait(ChannelReader<JsonElement> reader, Func<JsonElement, bool> predicate)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (await reader.WaitToReadAsync(timeout.Token)) while (reader.TryRead(out var item)) if (predicate(item)) return item;
        throw new InvalidOperationException("Expected live event was not received");
    }
}
