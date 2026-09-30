using System.Data;
using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Discorda.Api.Auth;

public sealed class MemberRequirement : IAuthorizationRequirement;
public sealed record MemberProfile(Guid Id, string DisplayName, string Email, string? AvatarUrl = null);

public sealed class MemberAccess(DiscordaDbContext database)
{
    public async Task<MemberProfile?> ResolveAsync(VerifiedIdentity identity, string issuer, Guid sessionId, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            await using var transaction = await database.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                var allowed = await database.AllowedUsers.FromSqlInterpolated(
                    $"SELECT * FROM discorda.allowed_users WHERE \"NormalizedEmail\" = {identity.Email} FOR UPDATE")
                    .SingleOrDefaultAsync(cancellationToken);
                if (allowed is not { Enabled: true }) return null;
                var subject = identity.Subject.ToString();
                var user = await database.Users.SingleOrDefaultAsync(x => x.AuthIssuer == issuer && x.AuthSubject == subject, cancellationToken);
                if (allowed.BoundUserId is not null && allowed.BoundUserId != user?.Id) return null;
                if (user is not null && allowed.BoundUserId != user.Id) return null;
                if (user is null)
                {
                    user = new User { AuthIssuer = issuer, AuthSubject = subject, Email = identity.Email, DisplayName = identity.DisplayName };
                    database.Users.Add(user);
                }
                // One allowlist entry can only ever bind to one identity without an explicit admin change.
                allowed.BoundUserId = user.Id;
                var session = await database.ApplicationSessions.SingleOrDefaultAsync(x => x.Id == sessionId, cancellationToken);
                if (session is not null && (session.RevokedAt is not null || session.UserId != user.Id)) return null;
                if (session is null) database.ApplicationSessions.Add(new ApplicationSession { Id = sessionId, UserId = user.Id });
                user.Email = identity.Email;
                user.DisplayName = user.CustomDisplayName ?? identity.DisplayName;
                if (user.LastSeenAt is null || user.LastSeenAt < DateTimeOffset.UtcNow.AddMinutes(-1)) user.LastSeenAt = DateTimeOffset.UtcNow;
                await database.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new MemberProfile(user.Id, user.DisplayName, user.Email, identity.AvatarUrl);
            }
            catch (Exception error) when (attempt < 2 && IsConcurrencyConflict(error))
            {
                await transaction.RollbackAsync(cancellationToken);
                database.ChangeTracker.Clear();
            }
        }
        return null;
    }

    private static bool IsConcurrencyConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current is PostgresException postgres && postgres.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation)
                return true;
        return false;
    }
}

public sealed class MemberHandler(MemberAccess access, IHttpContextAccessor accessor) : AuthorizationHandler<MemberRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, MemberRequirement requirement)
    {
        var http = accessor.HttpContext;
        if (http is null || http.Items[typeof(VerifiedIdentity)] is not VerifiedIdentity identity
            || !Guid.TryParse(context.User.FindFirst("session_id")?.Value, out var sessionId)) return;
        var profile = await access.ResolveAsync(identity, context.User.FindFirst("iss")!.Value, sessionId, http.RequestAborted);
        if (profile is null) return;
        http.Items[typeof(MemberProfile)] = profile;
        context.Succeed(requirement);
    }
}

