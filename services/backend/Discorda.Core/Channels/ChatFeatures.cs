namespace Discorda.Core.Channels;

public sealed class MessageReaction
{
    public long MessageId { get; init; }
    public Guid UserId { get; init; }
    public required string Emoji { get; init; }
}

public sealed class MessagePin
{
    public long MessageId { get; init; }
    public Guid UserId { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed class ChannelRead
{
    public Guid UserId { get; init; }
    public Guid ChannelId { get; init; }
    public long MessageId { get; set; }
}

public sealed class ManagementAudit
{
    public long Id { get; init; }
    public Guid ActorId { get; init; }
    public required string Action { get; init; }
    public required string Target { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}
