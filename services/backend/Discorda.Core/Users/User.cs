namespace Discorda.Core.Users;

public sealed class User
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string AuthIssuer { get; init; }
    public required string AuthSubject { get; init; }
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public string? CustomDisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastSeenAt { get; set; }
}
