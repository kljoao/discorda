namespace Discorda.Core.Workspaces;

public sealed class Workspace
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public enum MemberRole { Owner, Member }

public sealed class WorkspaceMember
{
    public Guid WorkspaceId { get; init; }
    public Guid UserId { get; init; }
    public MemberRole Role { get; set; } = MemberRole.Member;
    public DateTimeOffset JoinedAt { get; init; } = DateTimeOffset.UtcNow;
}
