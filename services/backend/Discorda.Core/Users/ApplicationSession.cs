namespace Discorda.Core.Users;

// Supabase owns refresh tokens. This row controls access to Discorda independently.
public sealed class ApplicationSession
{
    public Guid Id { get; init; }
    public Guid UserId { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class AccessAudit
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Action { get; init; }
    public Guid TargetId { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}
