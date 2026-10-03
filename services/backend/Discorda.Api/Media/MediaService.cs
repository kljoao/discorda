using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using Discorda.Api.Auth;
using Discorda.Api.Chat;
using Discorda.Core.Channels;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Discorda.Api.Media;

public sealed record MediaLease(Guid Id, Guid UserId, Guid SessionId, Guid ChannelId, DateTimeOffset Until);
public sealed record MediaCommand(Guid ChannelId, Guid? LeaseId);
public sealed record VoiceMember(Guid ChannelId, Guid UserId, string Name, Guid LeaseId);

// A single-host admission registry. Restarting the API invalidates all existing leases.
public sealed class MediaService(IConfiguration config, IServiceScopeFactory scopes, IHttpClientFactory clients, ILogger<MediaService> logger) : BackgroundService
{
    private readonly ConcurrentDictionary<Guid, MediaLease> leases = new();
    private readonly ConcurrentDictionary<Guid, (DateTimeOffset Until, Guid? Channel)> moderation = new();
    public bool AdmissionAllowed(Guid user, Guid channel) => !moderation.TryGetValue(user, out var entry) || entry.Until <= DateTimeOffset.UtcNow || entry.Channel == channel;
    public async Task<bool> Moderate(Guid user, Guid? destination, CancellationToken ct)
    {
        if (!leases.TryRemove(user, out var lease)) return false;
        moderation[user] = (DateTimeOffset.UtcNow.AddSeconds(60), destination);
        try { await Rpc("RemoveParticipant", new { room = RoomName(lease.ChannelId), identity = lease.Id.ToString() }, new { room = RoomName(lease.ChannelId), roomAdmin = true }, ct); }
        catch (HttpRequestException) { /* Reconciliation retries removal; admission is already revoked. */ }
        return true;
    }
    private VoiceMember[] roster = [];
    public VoiceMember[] Roster => Volatile.Read(ref roster).Where(member => leases.TryGetValue(member.UserId, out var lease) && lease.ChannelId == member.ChannelId && lease.Until > DateTimeOffset.UtcNow).ToArray();
    public bool Enabled => !string.IsNullOrEmpty(config["LiveKit:ApiSecret"]) && !string.IsNullOrEmpty(config["LiveKit:PublicUrl"]);
    public static string RoomName(Guid channel) => $"discorda-{channel:D}";
    public string Token(string subject, string name, object grant)
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new JwtPayload { ["iss"] = config["LiveKit:ApiKey"]!, ["sub"] = subject, ["name"] = name,
            ["nbf"] = now.AddSeconds(-5).ToUnixTimeSeconds(), ["exp"] = now.AddSeconds(60).ToUnixTimeSeconds(), ["video"] = JsonSerializer.SerializeToElement(grant) };
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(new JwtHeader(new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["LiveKit:ApiSecret"]!)), SecurityAlgorithms.HmacSha256)), payload));
    }
    private async Task<JsonElement> Rpc(string method, object body, object grant, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{config["LiveKit:InternalUrl"] ?? "http://127.0.0.1:7880"}/twirp/livekit.RoomService/{method}");
        request.Headers.Authorization = new("Bearer", Token("server", "", grant));
        request.Content = JsonContent.Create(body);
        using var response = await clients.CreateClient("livekit").SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(ct);
    }
    public async Task<bool> Healthy(CancellationToken ct) {
        if(!Enabled)return false;
        try {await Rpc("ListRooms", new {}, new {roomList=true}, ct);return true;}
        catch(Exception e) when(e is HttpRequestException or TaskCanceledException or JsonException) {return false;}
    }
    public async Task<object> Join(MemberProfile profile, Guid session, Guid channel, CancellationToken ct)
    {
        var room = RoomName(channel);
        await Rpc("CreateRoom", new { name = room, max_participants = 15, empty_timeout = 60 }, new { roomCreate = true }, ct);
        var lease = new MediaLease(Guid.NewGuid(), profile.Id, session, channel, DateTimeOffset.UtcNow.AddSeconds(45));
        leases[profile.Id] = lease;
        return new { leaseId = lease.Id, url = config["LiveKit:PublicUrl"], token = Token(lease.Id.ToString(), profile.DisplayName,
            new { room, roomJoin = true, canPublish = true, canSubscribe = true, canPublishData = false,
                canUpdateOwnMetadata = false, canPublishSources = new[] { "microphone", "camera", "screen_share", "screen_share_audio" } }) };
    }
    public MediaLease? SpeakingLease(Guid user, Guid session, Guid id) => leases.TryGetValue(user, out var lease) && lease.Id == id && lease.SessionId == session && lease.Until > DateTimeOffset.UtcNow ? lease : null;
    public bool Pulse(Guid user, Guid session, MediaCommand command)
    {
        if (!leases.TryGetValue(user, out var lease) || lease.Id != command.LeaseId || lease.SessionId != session || lease.ChannelId != command.ChannelId || lease.Until <= DateTimeOffset.UtcNow) return false;
        return leases.TryUpdate(user, lease with { Until = DateTimeOffset.UtcNow.AddSeconds(45) }, lease);
    }
    public void Leave(Guid user, Guid session, MediaCommand command)
    {
        if (leases.TryGetValue(user, out var lease) && lease.Id == command.LeaseId && lease.SessionId == session)
            ((ICollection<KeyValuePair<Guid, MediaLease>>)leases).Remove(new(user, lease));
    }
    private async Task Reconcile(CancellationToken ct)
    {
        // Only revoke leases included in this authorization query. A concurrent join
        // must not be judged against an older database snapshot.
        var snapshot = leases.ToArray();
        var checkedIds = snapshot.Select(x => x.Value.Id).ToHashSet();
        var valid = new HashSet<Guid>();
        var names = new Dictionary<Guid, string>();
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<DiscordaDbContext>();
            var sessions = snapshot.Select(x => x.Value.SessionId).ToArray();
            valid = (await (from s in db.ApplicationSessions join a in db.AllowedUsers on s.UserId equals a.BoundUserId
                join m in db.WorkspaceMembers on s.UserId equals m.UserId
                where sessions.Contains(s.Id) && s.RevokedAt == null && a.Enabled && m.WorkspaceId == ChatEndpoints.GroupId
                select s.Id).ToArrayAsync(ct)).ToHashSet();
            var users = snapshot.Select(x => x.Key).ToArray();
            names = await db.Users.Where(x => users.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
        }
        catch (Exception) when (!ct.IsCancellationRequested) { /* Fail closed on authorization storage failures. */ }
        foreach (var entry in snapshot.Where(x => x.Value.Until <= DateTimeOffset.UtcNow || !valid.Contains(x.Value.SessionId)))
            ((ICollection<KeyValuePair<Guid, MediaLease>>)leases).Remove(entry);
        foreach (var entry in moderation.Where(x => x.Value.Until <= DateTimeOffset.UtcNow)) ((ICollection<KeyValuePair<Guid, (DateTimeOffset Until, Guid? Channel)>>)moderation).Remove(entry);
        var byLease = leases.Values.ToDictionary(x => x.Id);
        var rooms = await Rpc("ListRooms", new { }, new { roomList = true }, ct);
        var connected = new List<VoiceMember>();
        if (!rooms.TryGetProperty("rooms", out var items)) { Volatile.Write(ref roster, []); return; }
        foreach (var room in items.EnumerateArray())
        {
            var name = room.GetProperty("name").GetString()!;
            if (!name.StartsWith("discorda-", StringComparison.Ordinal)) continue;
            var result = await Rpc("ListParticipants", new { room = name }, new { room = name, roomAdmin = true }, ct);
            if (!result.TryGetProperty("participants", out var participants)) continue;
            foreach (var participant in participants.EnumerateArray())
            {
                var identity = participant.GetProperty("identity").GetString()!;
                var lease = Guid.TryParse(identity, out var leaseId) ? byLease.GetValueOrDefault(leaseId) : null;
                if (lease is not null && !checkedIds.Contains(lease.Id)) continue;
                if (lease is not null && RoomName(lease.ChannelId) == name && lease.Until > DateTimeOffset.UtcNow && valid.Contains(lease.SessionId) && names.TryGetValue(lease.UserId, out var displayName))
                {
                    connected.Add(new(lease.ChannelId, lease.UserId, displayName, lease.Id));
                    if (!participant.TryGetProperty("name", out var currentName) || currentName.GetString() != displayName)
                        await Rpc("UpdateParticipant", new { room = name, identity, name = displayName }, new { room = name, roomAdmin = true }, ct);
                    continue;
                }
                await Rpc("RemoveParticipant", new { room = name, identity }, new { room = name, roomAdmin = true }, ct);
            }
        }
        Volatile.Write(ref roster, connected.ToArray());
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));
        try { while (await timer.WaitForNextTickAsync(stoppingToken)) if (Enabled)
            try { await Reconcile(stoppingToken); } catch (Exception error) when (!stoppingToken.IsCancellationRequested) { Volatile.Write(ref roster, []); logger.LogWarning("Media reconciliation unavailable ({ErrorType})", error.GetType().Name); }
        } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}

public static class MediaEndpoints
{
    public static void MapMedia(this WebApplication app)
    {
        app.MapGet("/api/v1/chat/media/roster", async (HttpContext ctx, DiscordaDbContext db, MediaService media, CancellationToken ct) =>
        {
            var user = (MemberProfile)ctx.Items[typeof(MemberProfile)]!;
            return await db.WorkspaceMembers.AnyAsync(m => m.UserId == user.Id && m.WorkspaceId == ChatEndpoints.GroupId, ct)
                ? Results.Ok(media.Roster) : Results.Forbid();
        }).RequireAuthorization("Member");
        app.MapPost("/api/v1/chat/media/{action}", async (string action, MediaCommand command, HttpContext ctx, DiscordaDbContext db, MediaService media, CancellationToken ct) =>
        {
            var user = (MemberProfile)ctx.Items[typeof(MemberProfile)]!;
            var session = Guid.Parse(ctx.User.FindFirst("session_id")!.Value);
            if (action == "leave") { media.Leave(user.Id, session, command); return Results.Ok(new { }); }
            if (!await db.Channels.AnyAsync(c => c.Id == command.ChannelId && c.Type == ChannelType.Voice && c.WorkspaceId == ChatEndpoints.GroupId && c.ArchivedAt == null
                && db.WorkspaceMembers.Any(m => m.WorkspaceId == c.WorkspaceId && m.UserId == user.Id), ct)) return Results.NotFound();
            if (!media.Enabled) return Results.Problem(statusCode: 503, title: "Media server unavailable");
            if (!media.AdmissionAllowed(user.Id, command.ChannelId)) return Results.Forbid();
            if (action == "pulse") return media.Pulse(user.Id, session, command) ? Results.Ok(new { }) : Results.Conflict();
            if (action != "join") return Results.BadRequest();
            try { return Results.Ok(await media.Join(user, session, command.ChannelId, ct)); }
            catch (HttpRequestException) { return Results.Problem(statusCode: 503, title: "Media server unavailable"); }
        }).RequireAuthorization("Member");
    }
}

