namespace Discorda.Core.Users;

public sealed class AllowedUser
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string NormalizedEmail { get; init; }
    public bool Enabled { get; set; } = true;
    public Guid? BoundUserId { get; set; }
    public DateTimeOffset AddedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
