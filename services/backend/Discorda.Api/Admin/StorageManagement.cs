using System.Security.Cryptography;
using System.Text;
using Discorda.Api.Chat;
using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace Discorda.Api.Admin;
public static class StorageManagement
{
    public sealed record PolicyInput(int QuotaMiB,int RetentionDays,int Version);
    public sealed record CleanupInput(DateTimeOffset Cutoff,string Fingerprint);
    public static async Task<StoragePolicy> Policy(DiscordaDbContext db,CancellationToken ct)=>await db.StoragePolicies.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==1,ct)??new();
    public static void MapStorageManagement(this WebApplication app)
    {
        var api=app.MapGroup("/api/v1/admin/storage").RequireAuthorization("Member");
        api.AddEndpointFilter(async(ctx,next)=>AdminEndpoints.IsAdmin(ctx.HttpContext,app.Configuration)?await next(ctx):Results.Forbid());
        api.MapGet("/policy",async(DiscordaDbContext db,CancellationToken ct)=>Results.Ok(await Policy(db,ct)));
        api.MapPut("/policy",async(PolicyInput input,HttpContext ctx,DiscordaDbContext db,CancellationToken ct)=>{
            if(input.QuotaMiB is <16 or >10240||input.RetentionDays is <0 or >3650)return Results.BadRequest();
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891324)",ct);
            var policy=await db.StoragePolicies.SingleOrDefaultAsync(x=>x.Id==1,ct);if((policy?.Version??1)!=input.Version)return Results.Conflict();
            if(policy is null){policy=new();db.StoragePolicies.Add(policy);}policy.QuotaMiB=input.QuotaMiB;policy.RetentionDays=input.RetentionDays;policy.Version++;
            Permissions.Audit(db,ctx,"storage.policy","storage");await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return Results.Ok(policy);
        }).RequireRateLimiting("admin-writes");
        api.MapPost("/preview",async(DiscordaDbContext db,CancellationToken ct)=>{
            var policy=await Policy(db,ct);if(policy.RetentionDays==0)return Results.BadRequest();var cutoff=DateTimeOffset.UtcNow.AddDays(-policy.RetentionDays);
            var items=await Candidates(db,cutoff).Take(101).ToListAsync(ct);var batch=items.Take(100).ToArray();
            return Results.Ok(new{cutoff,fingerprint=Fingerprint(batch.Select(i=>(i.Id,i.Size)),policy.Version),count=batch.Length,bytes=batch.Sum(i=>(long)i.Size),hasMore=items.Count>100,files=batch.Select(i=>new{i.Name,i.Size,i.CreatedAt})});
        });
        api.MapPost("/cleanup",async(CleanupInput input,HttpContext ctx,DiscordaDbContext db,LiveChat live,CancellationToken ct)=>{
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891324)",ct);var policy=await Policy(db,ct);
            var boundary=DateTimeOffset.UtcNow.AddDays(-policy.RetentionDays);if(policy.RetentionDays==0||input.Cutoff>boundary||input.Cutoff<boundary.AddMinutes(-5))return Results.Conflict();
            var batch=await Candidates(db,input.Cutoff).Take(100).ToListAsync(ct);if(input.Fingerprint!=Fingerprint(batch.Select(i=>(i.Id,i.Size)),policy.Version))return Results.Conflict();
            var ids=batch.Select(i=>i.Id).ToArray();var messages=batch.Select(i=>i.MessageId).ToArray();
            await db.MessageAttachments.Where(a=>ids.Contains(a.Id)).ExecuteDeleteAsync(ct);
            await db.Messages.Where(m=>messages.Contains(m.Id)).ExecuteUpdateAsync(s=>s.SetProperty(m=>m.Body,"Arquivo removido pela política de armazenamento.").SetProperty(m=>m.Version,m=>m.Version+1),ct);
            Permissions.Audit(db,ctx,"storage.cleanup",batch.Count.ToString());await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
            foreach(var message in await ChatEndpoints.Views(db,m=>messages.Contains(m.Id)).ToListAsync(ct))await live.Publish("message",message);
            return Results.Ok(new{removed=batch.Count});
        }).RequireRateLimiting("admin-writes");
    }
    private sealed record Candidate(Guid Id,long MessageId,string Name,int Size,DateTimeOffset CreatedAt);
    private static IQueryable<Candidate> Candidates(DiscordaDbContext db,DateTimeOffset cutoff)=>from a in db.MessageAttachments.AsNoTracking() join m in db.Messages on a.MessageId equals m.Id where m.CreatedAt<cutoff orderby m.Id, a.Id select new Candidate(a.Id,m.Id,a.Name,a.Size,m.CreatedAt);
    private static string Fingerprint(IEnumerable<(Guid Id,int Size)> items,int version)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(version+":"+string.Join(';',items.Select(i=>$"{i.Id}:{i.Size}")))));
}
