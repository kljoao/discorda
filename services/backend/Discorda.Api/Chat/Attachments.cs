using Discorda.Api.Auth;
using Discorda.Core.Channels;
using Discorda.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Chat;

public sealed record UploadAttachment(Guid ClientId, string Name, string Content);
public static class Attachments
{
    public const int MaxBytes = 8 * 1024 * 1024;
    public static void MapAttachments(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/chat/channels/{channelId:guid}/attachments").RequireAuthorization("Member").RequireRateLimiting("attachments");
        api.MapPost("", async (Guid channelId, UploadAttachment input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            if (!await ChatEndpoints.Access(db, channelId, user, ct)) return Results.NotFound();
            if (input.ClientId == Guid.Empty || string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 180 || input.Name.Any(c => char.IsControl(c) || "/\\:".Contains(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format)
                || input.Content is null || input.Content.Length > (MaxBytes + 2) / 3 * 4) return Results.BadRequest();
            byte[] bytes;
            try { bytes = Convert.FromBase64String(input.Content); } catch (FormatException) { return Results.BadRequest(); }
            if (bytes.Length == 0 || bytes.Length > MaxBytes) return Results.BadRequest();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Serialize quota checks and retries without reading the stored byte arrays.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891324)", ct);
            var existing = await db.Messages.Where(m => m.AuthorId == user && m.ClientId == input.ClientId).Select(m => new { m.Id, m.ChannelId }).SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                if (existing.ChannelId != channelId) return Results.Conflict();
                var original = await db.MessageAttachments.AsNoTracking().SingleOrDefaultAsync(a => a.MessageId == existing.Id, ct);
                if (original is null || original.Name != input.Name.Trim() || !original.Content.AsSpan().SequenceEqual(bytes)) return Results.Conflict();
                return Results.Ok(await ChatEndpoints.Views(db, m => m.Id == existing.Id).SingleAsync(ct));
            }
            var policy = await Discorda.Api.Admin.StorageManagement.Policy(db, ct);
            if (await db.MessageAttachments.CountAsync(ct) >= 10000 || await db.MessageAttachments.SumAsync(a => (long)a.Size, ct) + bytes.Length > (long)policy.QuotaMiB * 1024 * 1024)
                return Results.Problem(statusCode: 507, title: "Limite de anexos do servidor atingido.");
            var message = new Message { ChannelId = channelId, AuthorId = user, ClientId = input.ClientId, Body = input.Name.Trim() };
            db.Messages.Add(message); await db.SaveChangesAsync(ct);
            db.MessageAttachments.Add(new() { MessageId = message.Id, Name = input.Name.Trim(), Content = bytes, Size = bytes.Length });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            var saved = await ChatEndpoints.Views(db, m => m.Id == message.Id).SingleAsync(ct);
            await live.Publish("message", saved); return Results.Ok(saved);
        }).WithMetadata(new RequestSizeLimitAttribute(12 * 1024 * 1024));
        api.MapGet("/{id:guid}", async (Guid channelId, Guid id, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) =>
        {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            if (!await ChatEndpoints.Access(db, channelId, user, ct)) return Results.NotFound();
            var file = await (from a in db.MessageAttachments.AsNoTracking() join m in db.Messages on a.MessageId equals m.Id
                where a.Id == id && m.ChannelId == channelId && m.DeletedAt == null select a).SingleOrDefaultAsync(ct);
            ctx.Response.Headers.CacheControl = "no-store";
            return file is null ? Results.NotFound() : Results.Ok(new { file.Name, Content = Convert.ToBase64String(file.Content) });
        });
    }
}
