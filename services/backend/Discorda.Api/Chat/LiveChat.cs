using Discorda.Api.Admin;
using Discorda.Api.Media;
using Discorda.Core.Workspaces;
using System.Collections.Concurrent;
using Discorda.Api.Auth;
using Discorda.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Chat;

public sealed record MemberRoleView(Guid Id,string Name,string Color,int Position);
public sealed record PresenceMember(Guid Id, string Name, string Status, Guid? TypingChannelId, string? AvatarUrl = null, string? AccountName = null, MemberRoleView[]? Roles = null);
public sealed record LivePeer(string ConnectionId, Guid UserId, Guid SessionId, string Name, DateTimeOffset ExpiresAt,
    DateTimeOffset SeenAt, bool Away, Guid? ChannelId, DateTimeOffset TypingUntil, Action Abort, string? AvatarUrl = null);

public sealed class LiveChat(IHubContext<ChatHub> hub, IServiceScopeFactory scopes, TimeProvider clock, ILogger<LiveChat> logger)
{
    private readonly ConcurrentDictionary<string, LivePeer> peers = new();
    public async Task Rename(Guid user, string name)
    {
        foreach (var peer in peers.Values.Where(x => x.UserId == user)) peers.TryUpdate(peer.ConnectionId, peer with { Name = name }, peer);
        await SendPresence();
        await Publish("profile", new { userId = user, displayName = name });
    }
    private readonly object admission = new();
    public bool Add(LivePeer peer)
    {
        lock (admission)
        {
            // HTTP limits do not bound persistent connections; enforce admission separately.
            if (peers.Count >= 128 || peers.Values.Count(x => x.UserId == peer.UserId) >= 4) return false;
            return peers.TryAdd(peer.ConnectionId, peer);
        }
    }
    public void Remove(string id) => peers.TryRemove(id, out _);
    public void Pulse(string id, Guid? channel, bool typing, bool away)
    {
        if (peers.TryGetValue(id, out var peer))
            peers.TryUpdate(id, peer with { SeenAt = clock.GetUtcNow(), Away = away, ChannelId = channel,
                TypingUntil = typing ? clock.GetUtcNow().AddSeconds(6) : DateTimeOffset.MinValue }, peer);
    }
    public static PresenceMember[] Snapshot(IEnumerable<LivePeer> live, DateTimeOffset now) => live
        .Where(x => x.SeenAt > now.AddSeconds(-45) && x.ExpiresAt > now)
        .GroupBy(x => x.UserId).Select(group => new PresenceMember(group.Key, group.First().Name,
            group.Any(x => !x.Away) ? "online" : "away", group.Where(x => x.TypingUntil > now).MaxBy(x => x.TypingUntil)?.ChannelId, group.First().AvatarUrl))
        .OrderBy(x => x.Name).ThenBy(x => x.Id).ToArray();

    private async Task<LivePeer[]> Authorized(CancellationToken ct)
    {
        var current = peers.Values.ToArray();
        if (current.Length == 0) return [];
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DiscordaDbContext>();
        var sessionIds = current.Select(x => x.SessionId).Distinct().ToArray();
        var valid = await (from session in db.ApplicationSessions
            join allowed in db.AllowedUsers on session.UserId equals allowed.BoundUserId
            join member in db.WorkspaceMembers on session.UserId equals member.UserId
            where sessionIds.Contains(session.Id) && session.RevokedAt == null && allowed.Enabled && member.WorkspaceId == ChatEndpoints.GroupId
            select session.Id).ToArrayAsync(ct);
        var now = clock.GetUtcNow(); var allowedIds = valid.ToHashSet();
        foreach (var peer in current.Where(x => !allowedIds.Contains(x.SessionId) || x.ExpiresAt <= now || x.SeenAt <= now.AddSeconds(-45)))
            if (peers.TryRemove(peer.ConnectionId, out var removed)) removed.Abort();
        return peers.Values.Where(x => allowedIds.Contains(x.SessionId) && x.ExpiresAt > now && x.SeenAt > now.AddSeconds(-45)).ToArray();
    }
    public async Task<bool> Validate(string connection, CancellationToken ct) => (await Authorized(ct)).Any(x => x.ConnectionId == connection);
    public async Task Publish(string kind, object data, CancellationToken ct = default)
    {
        try {
            var targets = await Authorized(ct);
            if(targets.Length==0)return;
            using var scope=scopes.CreateScope();var policy=await scope.ServiceProvider.GetRequiredService<ChannelPermissions>().Load(ct);
            if(kind=="channels")data=new{id=ChatEndpoints.GroupId};
            var property=data.GetType().GetProperty("ChannelId")??data.GetType().GetProperty("channelId");
            var channel=property?.GetValue(data) as Guid?;
            if(channel.HasValue)targets=targets.Where(t=>policy.Has(t.UserId,Permission.ViewChannel,channel)).ToArray();
            if(kind=="moderation") {var target=(Guid?)data.GetType().GetProperty("userId")?.GetValue(data);targets=targets.Where(t=>t.UserId==target).ToArray();}
            if(kind=="voiceRoster"&&data is VoiceMember[] roster){
                foreach(var group in targets.GroupBy(t=>t.UserId))await hub.Clients.Clients(group.Select(t=>t.ConnectionId).ToArray()).SendAsync("ChatEvent",new{kind,data=roster.Where(m=>policy.Has(group.Key,Permission.ViewChannel,m.ChannelId)).ToArray()},ct);
            }else if(targets.Length>0)await hub.Clients.Clients(targets.Select(t=>t.ConnectionId).ToArray()).SendAsync("ChatEvent",new{kind,data},ct);
        } catch (Exception error) when (!ct.IsCancellationRequested) {
            // REST has already committed. Clients resynchronize after reconnect and periodically.
            logger.LogWarning("Live chat delivery unavailable ({ErrorType})", error.GetType().Name);
        }
    }
    public async Task<PresenceMember[]> GetMembers(CancellationToken ct,Guid? channelId=null) {
        var members=await Members(await Authorized(ct),ct);
        if(!channelId.HasValue)return members.Select(m=>m with{TypingChannelId=null}).ToArray();
        using var scope=scopes.CreateScope();var policy=await scope.ServiceProvider.GetRequiredService<ChannelPermissions>().Load(ct);
        return members.Where(m=>policy.Has(m.Id,Permission.ViewChannel,channelId)).Select(m=>m with{TypingChannelId=m.TypingChannelId==channelId?channelId:null}).ToArray();
    }
    private async Task<PresenceMember[]> Members(LivePeer[] targets, CancellationToken ct)
    {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<DiscordaDbContext>();
            var members = await (from member in db.WorkspaceMembers
                join user in db.Users on member.UserId equals user.Id
                where member.WorkspaceId == ChatEndpoints.GroupId && user.LastSeenAt != null
                    && db.AllowedUsers.Any(allowed => allowed.BoundUserId == user.Id && allowed.Enabled)
                select new PresenceMember(user.Id, user.DisplayName, "offline", null, user.AvatarUrl, user.AccountDisplayName, null))
                .AsNoTracking().ToArrayAsync(ct);
            var online = Snapshot(targets, clock.GetUtcNow()).ToDictionary(x => x.Id);
            var policy=await scope.ServiceProvider.GetRequiredService<ChannelPermissions>().Load(ct);
            return members.Select(member => {
                var current=online.GetValueOrDefault(member.Id);
                return member with {Status=current?.Status??"offline",TypingChannelId=current?.TypingChannelId,
                    Roles=policy.Roles.Where(r=>!r.IsEveryone&&policy.RoleIds(member.Id).Contains(r.Id)).OrderByDescending(r=>r.Position).ThenBy(r=>r.Name).ThenBy(r=>r.Id)
                        .Select(r=>new MemberRoleView(r.Id,r.Name,r.Color,r.Position)).ToArray()};
            })
                .OrderBy(x => x.Name).ThenBy(x => x.Id).ToArray();
    }
    public async Task SendPresence(CancellationToken ct = default)
    {
        try {
            var targets = await Authorized(ct);
            if (targets.Length == 0) return;
            var roster = await Members(targets, ct);
            using var scope=scopes.CreateScope();var policy=await scope.ServiceProvider.GetRequiredService<ChannelPermissions>().Load(ct);
            foreach(var group in targets.GroupBy(t=>t.ChannelId)){
                if(!group.Key.HasValue){
                    foreach(var person in group.GroupBy(t=>t.UserId)){
                        var visible=roster.Select(m=>m with{TypingChannelId=m.TypingChannelId.HasValue&&policy.Has(person.Key,Permission.ViewChannel,m.TypingChannelId)?m.TypingChannelId:null}).ToArray();
                        await hub.Clients.Clients(person.Select(t=>t.ConnectionId).ToArray()).SendAsync("ChatEvent",new{kind="presence",channelId=(Guid?)null,data=visible},ct);
                    }
                    continue;
                }
                var recipients=group.Where(t=>!group.Key.HasValue||policy.Has(t.UserId,Permission.ViewChannel,group.Key)).ToArray();
                var filtered=roster.Where(m=>!group.Key.HasValue||policy.Has(m.Id,Permission.ViewChannel,group.Key)).Select(m=>m with{TypingChannelId=group.Key.HasValue&&m.TypingChannelId==group.Key?group.Key:null}).ToArray();
                if(recipients.Length>0)await hub.Clients.Clients(recipients.Select(t=>t.ConnectionId).ToArray()).SendAsync("ChatEvent",new{kind="presence",channelId=group.Key,data=filtered},ct);
                var denied=group.Except(recipients).ToArray();if(denied.Length>0)await hub.Clients.Clients(denied.Select(t=>t.ConnectionId).ToArray()).SendAsync("ChatEvent",new{kind="presence",channelId=group.Key,data=Array.Empty<PresenceMember>()},ct);
            }
        } catch (Exception) when (!ct.IsCancellationRequested) {
            // Fail closed if authorization storage becomes unavailable.
            foreach (var peer in peers.Values) if (peers.TryRemove(peer.ConnectionId, out var removed)) removed.Abort();
        }
    }
}

public sealed class ChatHub(LiveChat live, DiscordaDbContext db, TimeProvider clock, Discorda.Api.Media.MediaService media) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext()!;
        if (http.Items[typeof(MemberProfile)] is not MemberProfile profile ||
            !Guid.TryParse(Context.User?.FindFirst("session_id")?.Value, out var session) ||
            !long.TryParse(Context.User?.FindFirst("exp")?.Value, out var expiry) ||
            !await db.WorkspaceMembers.AnyAsync(x => x.UserId == profile.Id && x.WorkspaceId == ChatEndpoints.GroupId, Context.ConnectionAborted))
        { Context.Abort(); return; }
        var context = Context;
        if (!live.Add(new LivePeer(Context.ConnectionId, profile.Id, session, profile.DisplayName, DateTimeOffset.FromUnixTimeSeconds(expiry),
            clock.GetUtcNow(), false, null, DateTimeOffset.MinValue, context.Abort, profile.AvatarUrl)))
        { Context.Abort(); return; }
        await live.SendPresence();
        await base.OnConnectedAsync();
    }
    public async Task Pulse(Guid? channelId, bool typing, bool away)
    {
        var now = clock.GetUtcNow();
        if (Context.Items.TryGetValue("lastPulse", out var last) && last is DateTimeOffset previous && now - previous < TimeSpan.FromSeconds(1)) return;
        Context.Items["lastPulse"] = now;
        if (!await live.Validate(Context.ConnectionId, Context.ConnectionAborted)) { Context.Abort(); throw new HubException("Access denied"); }
        var profile=(MemberProfile)Context.GetHttpContext()!.Items[typeof(MemberProfile)]!;
        var policy=await ChannelPermissions.Read(db,Context.GetHttpContext()!.RequestServices.GetRequiredService<IConfiguration>(),Context.ConnectionAborted);
        if (channelId is Guid id && !policy.Has(profile.Id,Permission.ViewChannel,id))
            throw new HubException("Unknown channel");
        live.Pulse(Context.ConnectionId, channelId, typing, away);
        await live.SendPresence();
    }
    public async Task VoiceActivity(Guid leaseId, bool speaking)
    {
        var now=clock.GetUtcNow();
        if(Context.Items.TryGetValue("voiceAt",out var previous) && previous is DateTimeOffset at && now-at<TimeSpan.FromMilliseconds(200))return;
        Context.Items["voiceAt"]=now;
        if(!await live.Validate(Context.ConnectionId,Context.ConnectionAborted)){Context.Abort();return;}
        var profile=Context.GetHttpContext()?.Items[typeof(MemberProfile)] as MemberProfile;
        if(profile is null || !Guid.TryParse(Context.User?.FindFirst("session_id")?.Value,out var session))return;
        var lease=media.SpeakingLease(profile.Id,session,leaseId);
        if(lease is null)return;
        await live.Publish("voice",new {userId=profile.Id,leaseId,channelId=lease.ChannelId,speaking},Context.ConnectionAborted);
    }
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        live.Remove(Context.ConnectionId); await live.SendPresence(); await base.OnDisconnectedAsync(exception);
    }
}

public sealed class PresenceWorker(LiveChat live) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        try { while (await timer.WaitForNextTickAsync(stoppingToken)) await live.SendPresence(stoppingToken); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
