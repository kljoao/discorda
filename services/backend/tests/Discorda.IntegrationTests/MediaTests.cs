using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Discorda.Api.Auth;
using Discorda.Api.Media;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.Http.Connections;

namespace Discorda.IntegrationTests;

public sealed class MediaTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private const string Secret = "test-only-media-key-at-least-thirty-two-bytes";
    private static readonly Guid Voice = Guid.Parse("bde069ed-d1c4-4930-92d3-9360eab43cb8");
    private readonly MediaStub stub = new();
    private WebApplicationFactory<Program> App() => fixture.App().WithWebHostBuilder(builder =>
    {
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> {
            ["LiveKit:ApiKey"] = "test-key", ["LiveKit:ApiSecret"] = Secret, ["LiveKit:PublicUrl"] = "wss://media.test",
            ["LiveKit:InternalUrl"] = "http://media.test" }));
        builder.ConfigureServices(s => s.AddHttpClient("livekit").ConfigurePrimaryHttpMessageHandler(() => stub));
    });
    private async Task<(HttpClient Client, string Email)> Member(WebApplicationFactory<Program> app)
    {
        var subject = Guid.NewGuid(); var email = subject + "@example.test";
        await WhitelistCommand.RunAsync(app.Services, ["whitelist", "allow", email]);
        var client = app.CreateClient(); client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(subject, Guid.NewGuid(), email));
        (await client.GetAsync("/api/v1/chat/workspace")).EnsureSuccessStatusCode(); return (client, email);
    }
    [Fact]
    public async Task JoinRequiresMembershipAndIssuesOnlyScopedShortMediaToken()
    {
        await using var app = App(); using var anonymous = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/v1/chat/media/join", new MediaCommand(Voice, null))).StatusCode);
        var (client, _) = await Member(app); using var member = client;
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/chat/media/join", new MediaCommand(Guid.Parse("225a47d7-779e-4992-89d2-03b1517f9112"), null))).StatusCode);
        var response = await client.PostAsJsonAsync("/api/v1/chat/media/join", new MediaCommand(Voice, null)); response.EnsureSuccessStatusCode();
        var grant = await response.Content.ReadFromJsonAsync<JsonElement>();
        new JwtSecurityTokenHandler().ValidateToken(grant.GetProperty("token").GetString(), new TokenValidationParameters {
            ValidateIssuer = true, ValidIssuer = "test-key", ValidateAudience = false, ValidateLifetime = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)), ValidAlgorithms = [SecurityAlgorithms.HmacSha256] }, out var raw);
        var token = (JwtSecurityToken)raw;
        Assert.Equal(grant.GetProperty("leaseId").GetGuid().ToString(), token.Subject);
        Assert.True(token.ValidTo < DateTime.UtcNow.AddSeconds(65));
        var video = JsonSerializer.SerializeToElement(token.Payload["video"]);
        Assert.Equal(MediaService.RoomName(Voice), video.GetProperty("room").GetString());
        Assert.True(video.GetProperty("roomJoin").GetBoolean()); Assert.False(video.GetProperty("canPublishData").GetBoolean());
        Assert.False(video.TryGetProperty("roomAdmin", out _)); Assert.False(video.TryGetProperty("roomCreate", out _));
    }
    [Fact]
    public async Task StaleLeaveCannotEndNewCallAndBlockedMemberCannotRenewLease()
    {
        await using var app = App(); var (client, email) = await Member(app); using var member = client;
        async Task<Guid> Join() { var r = await client.PostAsJsonAsync("/api/v1/chat/media/join", new MediaCommand(Voice, null)); r.EnsureSuccessStatusCode(); return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("leaseId").GetGuid(); }
        var old = await Join(); var current = await Join(); Assert.NotEqual(old, current);
        (await client.PostAsJsonAsync("/api/v1/chat/media/leave", new MediaCommand(Voice, old))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/chat/media/pulse", new MediaCommand(Voice, old))).StatusCode);
        (await client.PostAsJsonAsync("/api/v1/chat/media/pulse", new MediaCommand(Voice, current))).EnsureSuccessStatusCode();
        await WhitelistCommand.RunAsync(app.Services, ["whitelist", "block", email]);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/chat/media/pulse", new MediaCommand(Voice, current))).StatusCode);
    }
    private sealed class MediaStub : HttpMessageHandler
    {
        public string? Identity;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            object response = request.RequestUri!.AbsolutePath.EndsWith("ListRooms", StringComparison.Ordinal) ? new { rooms = new[] { new { name = MediaService.RoomName(Voice) } } }
                : request.RequestUri.AbsolutePath.EndsWith("ListParticipants", StringComparison.Ordinal) ? new { participants = Identity is null ? Array.Empty<object>() : new object[] { new { identity = Identity, name = "Old name" } } } : new { };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(response) });
        }
    }

    [Fact]
    public async Task SpeakingBroadcastRequiresOwnCurrentLeaseAndReachesAnObserverOutsideTheCall()
    {
        await using var app=App();var (client,_)=await Member(app);using var member=client;
        var (observerClient,_)=await Member(app);using var observerHttp=observerClient;
        HubConnection Connect(HttpClient http)=>new HubConnectionBuilder().WithUrl(new Uri(app.Server.BaseAddress,"/api/v1/live"),options=>{
            options.Transports=HttpTransportType.LongPolling;options.HttpMessageHandlerFactory=_=>app.Server.CreateHandler();options.AccessTokenProvider=()=>Task.FromResult(http.DefaultRequestHeaders.Authorization!.Parameter);
        }).Build();
        await using var speaker=Connect(client);await using var observer=Connect(observerClient);
        var events=new List<JsonElement>();observer.On<JsonElement>("ChatEvent",e=>{if(e.GetProperty("kind").GetString()=="voice")lock(events)events.Add(e);});
        await speaker.StartAsync();await observer.StartAsync();
        await speaker.InvokeAsync("VoiceActivity",Guid.NewGuid(),true);await Task.Delay(300);lock(events)Assert.Empty(events);
        var response=await client.PostAsJsonAsync("/api/v1/chat/media/join",new MediaCommand(Voice,null));response.EnsureSuccessStatusCode();
        var lease=(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("leaseId").GetGuid();
        await observer.InvokeAsync("VoiceActivity",lease,true);await Task.Delay(300);lock(events)Assert.Empty(events);
        await speaker.InvokeAsync("VoiceActivity",lease,true);
        for(var i=0;i<30;i++){lock(events){if(events.Count>0)break;}await Task.Delay(100);}
        lock(events){Assert.Single(events);Assert.Equal(lease,events[0].GetProperty("data").GetProperty("leaseId").GetGuid());Assert.True(events[0].GetProperty("data").GetProperty("speaking").GetBoolean());}
        (await client.PostAsJsonAsync("/api/v1/chat/media/leave",new MediaCommand(Voice,lease))).EnsureSuccessStatusCode();
        await Task.Delay(300);await speaker.InvokeAsync("VoiceActivity",lease,true);await Task.Delay(300);lock(events)Assert.Single(events);
    }

    [Fact]
    public async Task RosterShowsOnlyConnectedAuthorizedParticipantsAndClearsAfterLeave()
    {
        await using var app = App(); var (client, _) = await Member(app); using var member = client;
        var response = await client.PostAsJsonAsync("/api/v1/chat/media/join", new MediaCommand(Voice, null)); response.EnsureSuccessStatusCode();
        var lease = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("leaseId").GetGuid();
        Assert.Empty((await client.GetFromJsonAsync<VoiceMember[]>("/api/v1/chat/media/roster"))!);
        stub.Identity = lease.ToString();
        VoiceMember[] roster = [];
        for (var attempt = 0; attempt < 20 && roster.Length == 0; attempt++) { await Task.Delay(250); roster = (await client.GetFromJsonAsync<VoiceMember[]>("/api/v1/chat/media/roster"))!; }
        Assert.Single(roster); Assert.Equal(lease, roster[0].LeaseId); Assert.Equal(Voice, roster[0].ChannelId); Assert.NotEqual("Old name", roster[0].Name);
        (await client.PostAsJsonAsync("/api/v1/chat/media/leave", new MediaCommand(Voice, lease))).EnsureSuccessStatusCode();
        Assert.Empty((await client.GetFromJsonAsync<VoiceMember[]>("/api/v1/chat/media/roster"))!);
        using var anonymous = app.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/chat/media/roster")).StatusCode);
    }
}
