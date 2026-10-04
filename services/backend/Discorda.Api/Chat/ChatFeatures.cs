using Discorda.Api.Admin;
using Discorda.Core.Channels;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Chat;

public static class ChatFeatures
{
    public static readonly string[] Emojis = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];
    public sealed record ReactionChange(string Emoji, bool Enabled);
    public sealed record PinChange(bool Enabled);
    public sealed record ReadChange(long MessageId);

    public static void MapChatFeatures(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/chat").RequireAuthorization("Member");
        api.MapGet("/reads", async (HttpContext ctx, DiscordaDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ChannelReads.Where(r => r.UserId == Permissions.User(ctx)).ToDictionaryAsync(r => r.ChannelId.ToString(), r => r.MessageId.ToString(), ct)));
        api.MapPut("/channels/{channelId:guid}/read", async (Guid channelId, ReadChange input, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            var user = Permissions.User(ctx);
            if (!await ChatEndpoints.Access(db, channelId, user, ct) || !await db.Messages.AnyAsync(m => m.Id == input.MessageId && m.ChannelId == channelId, ct)) return Results.NotFound();
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.channel_reads (\"UserId\",\"ChannelId\",\"MessageId\") VALUES ({user},{channelId},{input.MessageId}) ON CONFLICT (\"UserId\",\"ChannelId\") DO UPDATE SET \"MessageId\"=GREATEST(discorda.channel_reads.\"MessageId\", EXCLUDED.\"MessageId\")", ct);
            return Results.NoContent();
        });
        api.MapGet("/channels/{channelId:guid}/messages/{id:long}/context",async(Guid channelId,long id,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            if(!await ChatEndpoints.Access(db,channelId,Permissions.User(ctx),ct)||!await db.Messages.AnyAsync(m=>m.Id==id&&m.ChannelId==channelId&&m.DeletedAt==null&&m.ThreadRootId==null,ct))return Results.NotFound();
            var before=await db.Messages.Where(m=>m.ChannelId==channelId&&m.ThreadRootId==null&&m.Id<id).OrderByDescending(m=>m.Id).Select(m=>m.Id).Take(25).ToArrayAsync(ct);
            var after=await db.Messages.Where(m=>m.ChannelId==channelId&&m.ThreadRootId==null&&m.Id>id).OrderBy(m=>m.Id).Select(m=>m.Id).Take(25).ToArrayAsync(ct);
            var ids=before.Concat([id]).Concat(after).ToArray();
            return Results.Ok(new{items=(await ChatEndpoints.Views(db,m=>ids.Contains(m.Id)).ToListAsync(ct)).OrderBy(m=>long.Parse(m.Id)),hasMore=before.Length==25});
        });
        api.MapGet("/channels/{channelId:guid}/search", async (Guid channelId, string? q, long? before, Guid? author, string? after, string? until, string? fileType, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            if (!await ChatEndpoints.Access(db, channelId, Permissions.User(ctx), ct)) return Results.NotFound();
            q=q?.Trim()??"";
            if(q.Length>120||q.Any(char.IsControl)||before is <=0||!(fileType is null or "" or "any" or "image" or "video" or "audio" or "document"))return Results.BadRequest();
            DateTimeOffset? from=null,to=null;
            if(after is not null){if(!DateTimeOffset.TryParseExact(after,"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.AssumeUniversal,out var date))return Results.BadRequest();from=date;}
            if(until is not null){if(!DateTimeOffset.TryParseExact(until,"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.AssumeUniversal,out var date)||date.Year>=9999)return Results.BadRequest();to=date.AddDays(1);}
            if(from.HasValue&&to.HasValue&&from>=to)return Results.BadRequest();
            if(q.Length==0&&author is null&&from is null&&to is null&&string.IsNullOrEmpty(fileType))return Results.BadRequest();
            var messages=db.Messages.Where(m=>m.ChannelId==channelId&&m.DeletedAt==null&&(!before.HasValue||m.Id<before));
            if(author.HasValue)messages=messages.Where(m=>m.AuthorId==author);
            if(from.HasValue)messages=messages.Where(m=>m.CreatedAt>=from);
            if(to.HasValue)messages=messages.Where(m=>m.CreatedAt<to);
            if(q.Length>0)messages=messages.Where(m=>EF.Property<NpgsqlTypes.NpgsqlTsVector>(m,"SearchVector").Matches(EF.Functions.PlainToTsQuery("portuguese",q))||db.MessageAttachments.Any(a=>a.MessageId==m.Id&&a.Name.ToLower().Contains(q.ToLower())));
            var files=db.MessageAttachments.AsQueryable();
            if(fileType=="image")files=files.Where(a=>a.Name.ToLower().EndsWith(".png")||a.Name.ToLower().EndsWith(".jpg")||a.Name.ToLower().EndsWith(".jpeg")||a.Name.ToLower().EndsWith(".webp")||a.Name.ToLower().EndsWith(".gif"));
            if(fileType=="video")files=files.Where(a=>a.Name.ToLower().EndsWith(".mp4")||a.Name.ToLower().EndsWith(".webm")||a.Name.ToLower().EndsWith(".mkv"));
            if(fileType=="audio")files=files.Where(a=>a.Name.ToLower().EndsWith(".mp3")||a.Name.ToLower().EndsWith(".wav")||a.Name.ToLower().EndsWith(".ogg")||a.Name.ToLower().EndsWith(".flac"));
            if(fileType=="document")files=files.Where(a=>a.Name.ToLower().EndsWith(".pdf")||a.Name.ToLower().EndsWith(".txt")||a.Name.ToLower().EndsWith(".docx")||a.Name.ToLower().EndsWith(".xlsx")||a.Name.ToLower().EndsWith(".pptx"));
            if(!string.IsNullOrEmpty(fileType))messages=messages.Where(m=>files.Any(a=>a.MessageId==m.Id));
            var ids=await messages.OrderByDescending(m=>m.Id).Select(m=>m.Id).Take(51).ToArrayAsync(ct);
            var page=ids.Take(50).ToArray();
            return Results.Ok(new {items=(await ChatEndpoints.Views(db,m=>page.Contains(m.Id)).ToArrayAsync(ct)).OrderByDescending(m=>long.Parse(m.Id)),hasMore=ids.Length>50});
        });
        api.MapGet("/channels/{channelId:guid}/pins", async (Guid channelId, long? before, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            if (!await ChatEndpoints.Access(db, channelId, Permissions.User(ctx), ct)) return Results.NotFound();
            var ids = await db.MessagePins.Where(p => (!before.HasValue || p.MessageId < before) && db.Messages.Any(m => m.Id == p.MessageId && m.ChannelId == channelId && m.DeletedAt == null))
                .OrderByDescending(p => p.MessageId).Select(p => p.MessageId).Take(51).ToArrayAsync(ct);
            var page = ids.Take(50).ToArray();
            return Results.Ok(new { items = (await ChatEndpoints.Views(db, m => page.Contains(m.Id)).ToArrayAsync(ct)).OrderByDescending(m => long.Parse(m.Id)), hasMore = ids.Length > 50 });
        });
        api.MapGet("/channels/{channelId:guid}/annotations", async (Guid channelId, string? ids, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            if (!await ChatEndpoints.Access(db, channelId, Permissions.User(ctx), ct)) return Results.NotFound();
            var parts = ids?.Split(',') ?? [];
            if (parts.Length == 0 || parts.Length > 100 || parts.Any(s => !long.TryParse(s, out var id) || id < 1)) return Results.BadRequest();
            var selected = parts.Select(long.Parse).Distinct().ToArray(); var user = Permissions.User(ctx);
            var reactions = await db.MessageReactions.Where(r => selected.Contains(r.MessageId) && db.Messages.Any(m => m.Id == r.MessageId && m.ChannelId == channelId && m.DeletedAt == null))
                .GroupBy(r => new { r.MessageId, r.Emoji }).Select(g => new { id = g.Key.MessageId.ToString(), emoji = g.Key.Emoji, count = g.Count(), mine = g.Any(r => r.UserId == user) }).ToArrayAsync(ct);
            var pins = await db.MessagePins.Where(p => selected.Contains(p.MessageId) && db.Messages.Any(m => m.Id == p.MessageId && m.ChannelId == channelId && m.DeletedAt == null)).Select(p => p.MessageId.ToString()).ToArrayAsync(ct);
            return Results.Ok(new { reactions, pins });
        });
        api.MapPut("/channels/{channelId:guid}/messages/{id:long}/reaction", async (Guid channelId, long id, ReactionChange input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) => {
            var user = Permissions.User(ctx);
            if (!await ChatEndpoints.Access(db, channelId, user, ct) || !await db.Messages.AnyAsync(m => m.Id == id && m.ChannelId == channelId && m.DeletedAt == null, ct)) return Results.NotFound();
            if (!Emojis.Contains(input.Emoji)) return Results.BadRequest();
            if (input.Enabled) await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.message_reactions (\"MessageId\",\"UserId\",\"Emoji\") VALUES ({id},{user},{input.Emoji}) ON CONFLICT DO NOTHING", ct);
            else await db.MessageReactions.Where(r => r.MessageId == id && r.UserId == user && r.Emoji == input.Emoji).ExecuteDeleteAsync(ct);
            await live.Publish("annotations", new { channelId, id = id.ToString() });
            return Results.NoContent();
        });
        api.MapPut("/channels/{channelId:guid}/messages/{id:long}/pin", async (Guid channelId, long id, PinChange input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) => {
            await using var tx = await Permissions.BeginChange(db, ct);
            if (Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct)) < 1) return Results.Forbid();
            if (!await ChatEndpoints.Access(db, channelId, Permissions.User(ctx), ct) || !await db.Messages.AnyAsync(m => m.Id == id && m.ChannelId == channelId && m.DeletedAt == null, ct)) return Results.NotFound();
            if (input.Enabled) await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.message_pins (\"MessageId\",\"UserId\",\"CreatedAt\") VALUES ({id},{Permissions.User(ctx)},{DateTimeOffset.UtcNow}) ON CONFLICT DO NOTHING", ct);
            else await db.MessagePins.Where(p => p.MessageId == id).ExecuteDeleteAsync(ct);
            Permissions.Audit(db, ctx, input.Enabled ? "message.pin" : "message.unpin", id.ToString()); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            await live.Publish("annotations", new { channelId, id = id.ToString() }); return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
    }
}
