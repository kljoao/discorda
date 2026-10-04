using Discorda.Api.Auth;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Chat;

public static class Inbox
{
    public sealed record FollowInput(bool Enabled);
    public static void MapInbox(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/chat").RequireAuthorization("Member");
        api.MapGet("/catch-up",async(DateTimeOffset? since,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            var user=((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            if(!await db.WorkspaceMembers.AnyAsync(w=>w.WorkspaceId==ChatEndpoints.GroupId&&w.UserId==user,ct))return Results.Forbid();
            var cutoff=since??DateTimeOffset.UtcNow.AddDays(-7);
            if(cutoff>DateTimeOffset.UtcNow||cutoff<DateTimeOffset.UtcNow.AddDays(-30))cutoff=DateTimeOffset.UtcNow.AddDays(-30);
            var channels=await db.Channels.AsNoTracking().Where(c=>c.WorkspaceId==ChatEndpoints.GroupId&&c.ArchivedAt==null&&c.Type==Discorda.Core.Channels.ChannelType.Text).OrderBy(c=>c.SortOrder).Take(100).Select(c=>new{c.Id,c.Name,
                lastMessageId=db.Messages.Where(m=>m.ChannelId==c.Id&&m.ThreadRootId==null&&m.DeletedAt==null).OrderByDescending(m=>m.Id).Select(m=>(long?)m.Id).FirstOrDefault(),
                readId=db.ChannelReads.Where(r=>r.UserId==user&&r.ChannelId==c.Id).Select(r=>(long?)r.MessageId).FirstOrDefault()}).ToListAsync(ct);
            var pins=await (from pin in db.MessagePins join m in db.Messages on pin.MessageId equals m.Id join c in db.Channels on m.ChannelId equals c.Id join a in db.Users on m.AuthorId equals a.Id
                where pin.CreatedAt>=cutoff&&m.DeletedAt==null&&c.WorkspaceId==ChatEndpoints.GroupId&&c.ArchivedAt==null orderby pin.CreatedAt descending
                select new{id=m.Id.ToString(),m.ChannelId,channelName=c.Name,authorName=a.DisplayName,m.Body,m.CreatedAt,threadRootId=m.ThreadRootId==null?null:m.ThreadRootId.ToString(),kind="pin",read=false}).Take(20).ToListAsync(ct);
            return Results.Ok(new{since=cutoff,channels=channels.Where(c=>c.lastMessageId.HasValue&&c.lastMessageId>(c.readId??0)).Select(c=>new{c.Id,c.Name,lastMessageId=c.lastMessageId.ToString()}),pins});
        });
        api.MapGet("/inbox", async (long? before, bool? unread, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            var rows = await (from i in db.InboxEntries.AsNoTracking() join m in db.Messages on i.MessageId equals m.Id
                join c in db.Channels on m.ChannelId equals c.Id join a in db.Users on m.AuthorId equals a.Id
                where i.UserId == user && (!unread.HasValue || !unread.Value || !i.Read) && (!before.HasValue || i.MessageId < before)
                    && m.DeletedAt == null && c.ArchivedAt == null && c.WorkspaceId == ChatEndpoints.GroupId
                    && db.WorkspaceMembers.Any(w => w.WorkspaceId == c.WorkspaceId && w.UserId == user)
                orderby i.MessageId descending
                select new { id = i.MessageId.ToString(), m.ChannelId, channelName = c.Name, authorName = a.DisplayName,
                    m.Body, m.CreatedAt, threadRootId = m.ThreadRootId == null ? null : m.ThreadRootId.ToString(), i.Kind, i.Read }).Take(51).ToListAsync(ct);
            return Results.Ok(new { items = rows.Take(50), hasMore = rows.Count > 50 });
        });
        api.MapPut("/inbox/{id:long}/read", async (long id, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            await db.InboxEntries.Where(i => i.UserId == user && i.MessageId == id).ExecuteUpdateAsync(s => s.SetProperty(i => i.Read, true), ct);
            return Results.NoContent();
        });
        api.MapGet("/channels/{channelId:guid}/threads/{id:long}/follow", async (Guid channelId, long id, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            if (!await ChatEndpoints.Access(db, channelId, user, ct) || !await db.Messages.AnyAsync(m => m.Id == id && m.ChannelId == channelId && m.ThreadRootId == null && m.DeletedAt == null, ct)) return Results.NotFound();
            return Results.Ok(new { enabled = await db.ThreadFollows.AnyAsync(f => f.UserId == user && f.MessageId == id, ct) });
        });
        api.MapPut("/channels/{channelId:guid}/threads/{id:long}/follow", async (Guid channelId, long id, FollowInput input, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            if (!await ChatEndpoints.Access(db, channelId, user, ct) || !await db.Messages.AnyAsync(m => m.Id == id && m.ChannelId == channelId && m.ThreadRootId == null && m.DeletedAt == null, ct)) return Results.NotFound();
            if (input.Enabled) await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.thread_follows (\"UserId\", \"MessageId\") VALUES ({user}, {id}) ON CONFLICT DO NOTHING", ct);
            else await db.ThreadFollows.Where(f => f.UserId == user && f.MessageId == id).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });
    }

    // One set-based insert in the message transaction. Recipients are current members;
    // the composite key makes retries idempotent and indexes bound each inbox page.
    public static Task Record(DiscordaDbContext db, long id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO discorda.inbox_entries ("UserId", "MessageId", "Kind", "Read")
        SELECT w."UserId", m."Id",
            CASE WHEN position('<@' || w."UserId"::text || '>' in m."Body") > 0 THEN 'mention'
                 WHEN parent."AuthorId" = w."UserId" THEN 'reply' ELSE 'thread' END, false
        FROM discorda.messages m
        JOIN discorda.workspace_members w ON w."WorkspaceId" = {ChatEndpoints.GroupId}
        LEFT JOIN discorda.messages parent ON parent."Id" = m."ReplyToId"
        LEFT JOIN discorda.thread_follows f ON f."UserId" = w."UserId" AND f."MessageId" = m."ThreadRootId"
        WHERE m."Id" = {id} AND m."AuthorId" <> w."UserId"
            AND (position('<@' || w."UserId"::text || '>' in m."Body") > 0 OR parent."AuthorId" = w."UserId" OR f."UserId" IS NOT NULL)
        ON CONFLICT DO NOTHING
        """, ct);
}
