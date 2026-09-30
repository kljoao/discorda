using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "discorda");

            migrationBuilder.CreateTable(
                name: "users",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoogleIssuer = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    GoogleSubject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AvatarUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "workspaces",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspaces", x => x.Id);
                    table.CheckConstraint("ck_workspace_name", "length(trim(\"Name\")) > 0");
                });

            migrationBuilder.CreateTable(
                name: "allowed_users",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NormalizedEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    BoundUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    AddedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_allowed_users", x => x.Id);
                    table.ForeignKey(
                        name: "FK_allowed_users_users_BoundUserId",
                        column: x => x.BoundUserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "channels",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_channels", x => x.Id);
                    table.CheckConstraint("ck_channel_name", "length(trim(\"Name\")) > 0");
                    table.CheckConstraint("ck_channel_type", "\"Type\" IN ('Text', 'Voice')");
                    table.CheckConstraint("ck_channel_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_channels_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "discorda",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workspace_members",
                schema: "discorda",
                columns: table => new
                {
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_members", x => new { x.WorkspaceId, x.UserId });
                    table.CheckConstraint("ck_member_role", "\"Role\" IN ('Owner', 'Member')");
                    table.ForeignKey(
                        name: "FK_workspace_members_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_workspace_members_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "discorda",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_allowed_users_BoundUserId",
                schema: "discorda",
                table: "allowed_users",
                column: "BoundUserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_allowed_users_NormalizedEmail",
                schema: "discorda",
                table: "allowed_users",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_channels_WorkspaceId_SortOrder",
                schema: "discorda",
                table: "channels",
                columns: new[] { "WorkspaceId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_users_GoogleIssuer_GoogleSubject",
                schema: "discorda",
                table: "users",
                columns: new[] { "GoogleIssuer", "GoogleSubject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workspace_members_UserId",
                schema: "discorda",
                table: "workspace_members",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "allowed_users",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "channels",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "workspace_members",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "users",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "workspaces",
                schema: "discorda");
        }
    }
}
