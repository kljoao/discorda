using Discorda.Core.Channels;
using Discorda.Core.Users;
using Discorda.Core.Workspaces;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Infrastructure.Persistence;

public sealed class DiscordaDbContext(DbContextOptions<DiscordaDbContext> options) : DbContext(options)
{
    public DbSet<ServerInvite> ServerInvites => Set<ServerInvite>();
    public DbSet<JoinRequest> JoinRequests => Set<JoinRequest>();
    public DbSet<StoragePolicy> StoragePolicies => Set<StoragePolicy>();
    public DbSet<InboxEntry> InboxEntries => Set<InboxEntry>();
    public DbSet<ThreadFollow> ThreadFollows => Set<ThreadFollow>();
    public DbSet<User> Users => Set<User>();
    public DbSet<AllowedUser> AllowedUsers => Set<AllowedUser>();
    public DbSet<ApplicationSession> ApplicationSessions => Set<ApplicationSession>();
    public DbSet<AccessAudit> AccessAudits => Set<AccessAudit>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();
    public DbSet<Channel> Channels => Set<Channel>();
    public DbSet<MessageAttachment> MessageAttachments => Set<MessageAttachment>();
    public DbSet<Message> Messages => Set<Message>();

    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();
    public DbSet<MessagePin> MessagePins => Set<MessagePin>();
    public DbSet<ChannelRead> ChannelReads => Set<ChannelRead>();
    public DbSet<ManagementAudit> ManagementAudits => Set<ManagementAudit>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<StoragePolicy>(e => { e.ToTable("storage_policy", "discorda"); e.HasKey(x => x.Id); });
        model.Entity<ServerInvite>(e => {
            e.ToTable("server_invites", "discorda"); e.HasKey(x => x.Id); e.Property(x => x.TokenHash).HasMaxLength(64); e.HasIndex(x => x.TokenHash).IsUnique();
        });
        model.Entity<JoinRequest>(e => {
            e.ToTable("join_requests", "discorda"); e.HasKey(x => x.Id); e.Property(x => x.Email).HasMaxLength(320); e.Property(x => x.Name).HasMaxLength(100); e.Property(x => x.Issuer).HasMaxLength(256); e.Property(x => x.Status).HasMaxLength(12);
            e.HasIndex(x => new { x.InviteId, x.Subject }).IsUnique(); e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.HasOne<ServerInvite>().WithMany().HasForeignKey(x => x.InviteId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<InboxEntry>(e => {
            e.ToTable("inbox_entries", "discorda"); e.HasKey(x => new { x.UserId, x.MessageId });
            e.Property(x => x.Kind).HasMaxLength(12);
            e.HasIndex(x => new { x.UserId, x.Read, x.MessageId });
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Message>().WithMany().HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<ThreadFollow>(e => {
            e.ToTable("thread_follows", "discorda"); e.HasKey(x => new { x.UserId, x.MessageId });
            e.HasIndex(x => x.MessageId);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Message>().WithMany().HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<MessageAttachment>(b => {
            b.ToTable("message_attachments", "discorda"); b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(180);
            b.HasIndex(x => x.MessageId).IsUnique();
            b.HasOne<Message>().WithMany().HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
        });
        model.HasDefaultSchema("discorda");
        model.Entity<MessageReaction>(e => {
            e.ToTable("message_reactions"); e.HasKey(x => new { x.MessageId, x.UserId, x.Emoji });
            e.Property(x => x.Emoji).HasMaxLength(16);
            e.HasOne<Message>().WithMany().HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<MessagePin>(e => {
            e.ToTable("message_pins"); e.HasKey(x => x.MessageId);
            e.HasOne<Message>().WithMany().HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ChannelRead>(e => {
            e.ToTable("channel_reads"); e.HasKey(x => new { x.UserId, x.ChannelId });
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Channel>().WithMany().HasForeignKey(x => x.ChannelId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<ManagementAudit>(e => {
            e.ToTable("management_audit"); e.HasKey(x => x.Id);
            e.Property(x => x.Action).HasMaxLength(40); e.Property(x => x.Target).HasMaxLength(320);
            e.HasIndex(x => x.CreatedAt);
        });
        model.Entity<Message>(entity =>
        {
            entity.ToTable("messages", table => table.HasCheckConstraint("ck_message_version", "\"Version\" > 0"));
            entity.HasKey(x => x.Id);
            entity.Property<NpgsqlTypes.NpgsqlTsVector>("SearchVector").HasComputedColumnSql("to_tsvector('portuguese', \"Body\")", stored: true);
            entity.HasIndex("SearchVector").HasMethod("GIN");
            entity.Property(x => x.Body).HasMaxLength(4000);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasIndex(x => new { x.ChannelId, x.Id });
            entity.HasIndex(x => new { x.ChannelId, x.ThreadRootId, x.Id });
            entity.HasOne<Message>().WithMany().HasForeignKey(x => x.ThreadRootId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.AuthorId, x.ClientId }).IsUnique();
            entity.HasOne<Channel>().WithMany().HasForeignKey(x => x.ChannelId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Message>().WithMany().HasForeignKey(x => x.ReplyToId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.AuthIssuer).HasMaxLength(256);
            entity.Property(x => x.AuthSubject).HasMaxLength(255);
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.DisplayName).HasMaxLength(100);
            entity.Property(x => x.CustomDisplayName).HasMaxLength(32);
            entity.Property(x => x.AvatarUrl).HasMaxLength(2048);
            entity.HasIndex(x => new { x.AuthIssuer, x.AuthSubject }).IsUnique();
        });
        model.Entity<ApplicationSession>(entity =>
        {
            entity.ToTable("application_sessions");
            entity.HasKey(x => x.Id);
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<AccessAudit>(entity =>
        {
            entity.ToTable("access_audit");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Action).HasMaxLength(40);
        });
        model.Entity<AllowedUser>(entity =>
        {
            entity.ToTable("allowed_users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.NormalizedEmail).HasMaxLength(320);
            entity.HasIndex(x => x.NormalizedEmail).IsUnique();
            entity.HasIndex(x => x.BoundUserId).IsUnique();
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.BoundUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<Workspace>(entity =>
        {
            entity.ToTable("workspaces", table => table.HasCheckConstraint("ck_workspace_name", "length(trim(\"Name\")) > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(100);
        });
        model.Entity<WorkspaceMember>(entity =>
        {
            entity.ToTable("workspace_members", table => table.HasCheckConstraint("ck_member_role", "\"Role\" IN ('Owner', 'Member', 'Admin', 'Moderator')"));
            entity.HasKey(x => new { x.WorkspaceId, x.UserId });
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(16);
            entity.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<Channel>(entity =>
        {
            entity.ToTable("channels", table =>
            {
                table.HasCheckConstraint("ck_channel_type", "\"Type\" IN ('Text', 'Voice')");
                table.HasCheckConstraint("ck_channel_name", "length(trim(\"Name\")) > 0");
                table.HasCheckConstraint("ck_channel_version", "\"Version\" > 0");
            });
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasIndex(x => new { x.WorkspaceId, x.SortOrder });
            entity.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
