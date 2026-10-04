using System.Diagnostics;
using System.Text.Json;
using Discorda.Api.Chat;
using Discorda.Api.Media;
using Discorda.Core.Channels;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;

public static class CommunityAdmin
{
    public sealed record Setup(string Name, string[] TextChannels, string[] VoiceChannels);
    private static bool ValidName(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 80 && !value.Any(c => char.IsControl(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format);
    public static void MapCommunityAdmin(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin").RequireAuthorization("Member");
        group.AddEndpointFilter(async (context, next) => AdminEndpoints.IsAdmin(context.HttpContext, app.Configuration) ? await next(context) : Results.Forbid());
        group.MapGet("/attachments", async (long? before, DiscordaDbContext db, CancellationToken ct) => {
            var items = await (from a in db.MessageAttachments.AsNoTracking() join m in db.Messages on a.MessageId equals m.Id
                where !before.HasValue || m.Id < before orderby m.Id descending
                select new { a.Id, messageId = m.Id.ToString(), a.Name, a.Size, m.CreatedAt }).Take(51).ToListAsync(ct);
            return Results.Ok(new { items = items.Take(50), hasMore = items.Count > 50,
                usedBytes = await db.MessageAttachments.SumAsync(a => (long)a.Size, ct), limitBytes = (long)(await StorageManagement.Policy(db, ct)).QuotaMiB * 1024 * 1024 });
        });
        group.MapDelete("/attachments/{id:guid}", async (Guid id, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) => {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891324)", ct);
            var messageId = await db.MessageAttachments.Where(a => a.Id == id).Select(a => (long?)a.MessageId).SingleOrDefaultAsync(ct);
            if (messageId is null) return Results.NoContent();
            await db.MessageAttachments.Where(a => a.Id == id).ExecuteDeleteAsync(ct);
            await db.Messages.Where(m => m.Id == messageId).ExecuteUpdateAsync(s => s.SetProperty(m => m.Body, "Arquivo removido pelo administrador.").SetProperty(m => m.Version, m => m.Version + 1), ct);
            Permissions.Audit(db, ctx, "attachment.delete", id.ToString()); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            await live.Publish("message", await ChatEndpoints.Views(db, m => m.Id == messageId).SingleAsync(ct));
            return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        group.MapPut("/setup", async (Setup input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) => {
            if (!ValidName(input.Name) || input.TextChannels is null || input.VoiceChannels is null || input.TextChannels.Length > 10 || input.VoiceChannels.Length > 10 || input.TextChannels.Concat(input.VoiceChannels).Any(s => !ValidName(s))) return Results.BadRequest();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Serialize onboarding retries on this workspace; no duplicate channels on double submit.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891321)", ct);
            var workspace = await db.Workspaces.SingleAsync(w => w.Id == ChatEndpoints.GroupId, ct);
            workspace.Name = input.Name.Trim();
            var existing = await db.Channels.Where(c => c.WorkspaceId == workspace.Id && c.ArchivedAt == null).ToListAsync(ct);

            var names = existing.Select(c => (c.Type, c.Name.ToUpperInvariant())).ToHashSet();
            var additions = new List<Channel>();
            var order = existing.Count == 0 ? 0 : existing.Max(c => c.SortOrder) + 1;
            foreach (var (type, list) in new[] {(ChannelType.Text,input.TextChannels),(ChannelType.Voice,input.VoiceChannels)})
                foreach (var name in list.Select(s => s.Trim()))
                    if (names.Add((type,name.ToUpperInvariant()))) additions.Add(new Channel {WorkspaceId=workspace.Id,Name=name,Type=type,SortOrder=order++});
            if (existing.Count + additions.Count > 100) return Results.BadRequest();
            db.Channels.AddRange(additions);
            Permissions.Audit(db,ctx,"community.setup",workspace.Id.ToString());
            await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
            await live.Publish("channels",new {id=workspace.Id});
            return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        group.MapGet("/operations", async (DiscordaDbContext db, MediaService media, IConfiguration config, OperationsCache cache, CancellationToken requestCt) => Results.Ok(await cache.Get(async () => {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(requestCt);
            deadline.CancelAfter(TimeSpan.FromSeconds(8));
            var ct = deadline.Token;
            var mediaStatus = media.Healthy(ct);
            bool database=false;long? databaseBytes=null;string? databaseVersion=null;
            try {database=await db.Database.CanConnectAsync(ct);if(database)databaseBytes=await db.Database.SqlQueryRaw<long>("SELECT pg_database_size(current_database()) AS \"Value\"").SingleAsync(ct);}catch(Exception) when(!requestCt.IsCancellationRequested) { /* Return status, never credentials or database errors. */ }
            if(database)try{databaseVersion=await db.Database.SqlQueryRaw<string>("SELECT current_setting('server_version') AS \"Value\"").SingleAsync(ct);}catch(Exception) when(!requestCt.IsCancellationRequested){}
            using var process=Process.GetCurrentProcess();var uptime=Math.Max(1,(DateTime.UtcNow-process.StartTime.ToUniversalTime()).TotalSeconds);
            long? freeBytes=null,totalBytes=null;
            try{var disk=new DriveInfo(Path.GetFullPath(config["SelfHost:StateDirectory"]??".discorda"));freeBytes=disk.AvailableFreeSpace;totalBytes=disk.TotalSize;}catch { }
            object? backup=null;
            try{
                var file=Path.Combine(config["SelfHost:StateDirectory"]??".discorda","backup-status.json");
                if(new FileInfo(file).Length<=4096){using var json=JsonDocument.Parse(await File.ReadAllTextAsync(file,ct));var root=json.RootElement;
                    string? Date(string key)=>root.TryGetProperty(key,out var v)&&v.ValueKind==JsonValueKind.String&&DateTimeOffset.TryParse(v.GetString(),out var date)?date.ToUniversalTime().ToString("O"):null;
                    var ok=(root.TryGetProperty("ok",out var success)&&success.ValueKind==JsonValueKind.True)||(root.TryGetProperty("status",out var status)&&status.GetString()=="ok");
                    backup=new {ok,lastRun=Date("lastRun")??Date("checkedAt"),lastVerified=Date("lastVerified")};
                }
            }catch(Exception) when(!requestCt.IsCancellationRequested) { }
            return (object)new {checkedAt=DateTimeOffset.UtcNow,api="online",database=database?"ready":"unavailable",media=await mediaStatus?"online":"unavailable",activeCalls=media.Roster.Length,
                versions=new {api=typeof(CommunityAdmin).Assembly.GetName().Version?.ToString(3),runtime=Environment.Version.ToString(),database=databaseVersion,protocol=1},
                process=new {memoryBytes=process.WorkingSet64,cpuAveragePercent=Math.Round(process.TotalProcessorTime.TotalSeconds/uptime/Environment.ProcessorCount*100,1),uptimeSeconds=(long)uptime},storage=new {databaseBytes,freeBytes,totalBytes},backup};
        }, requestCt))).RequireRateLimiting("admin-writes");
    }
}
