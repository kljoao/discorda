using Discorda.Core.Channels;
using Discorda.Core.Users;
using Discorda.Core.Workspaces;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Infrastructure.Persistence;

public sealed class DiscordaDbContext(DbContextOptions<DiscordaDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<AllowedUser> AllowedUsers => Set<AllowedUser>();
    public DbSet<ApplicationSession> ApplicationSessions => Set<ApplicationSession>();
    public DbSet<AccessAudit> AccessAudits => Set<AccessAudit>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();
    public DbSet<Channel> Channels => Set<Channel>();
    public DbSet<Message> Messages => Set<Message>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("discorda");
        model.Entity<Message>(entity =>
        {
            entity.ToTable("messages", table => table.HasCheckConstraint("ck_message_version", "\"Version\" > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Body).HasMaxLength(4000);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasIndex(x => new { x.ChannelId, x.Id });
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
            entity.ToTable("workspace_members", table => table.HasCheckConstraint("ck_member_role", "\"Role\" IN ('Owner', 'Member')"));
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
