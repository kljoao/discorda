namespace Discorda.Core.Workspaces;
public sealed class ServerInvite
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string TokenHash { get; init; }
    public DateTimeOffset ExpiresAt { get; init; }
    public int MaxUses { get; init; }
    public int Uses { get; set; }
    public bool Revoked { get; set; }
}
public sealed class JoinRequest
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid InviteId { get; init; }
    public Guid Subject { get; init; }
    public required string Issuer { get; init; }
    public required string Email { get; init; }
    public required string Name { get; init; }
    public string Status { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}
public sealed class StoragePolicy
{
    public int Id { get; init; } = 1;
    public int QuotaMiB { get; set; } = 512;
    public int RetentionDays { get; set; } = 0;
    public int Version { get; set; } = 1;
}
