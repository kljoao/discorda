using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ModularChannelPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "PermissionVersion",
                schema: "discorda",
                table: "workspace_members",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.CreateTable(
                name: "permission_roles",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Color = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    IsEveryone = table.Column<bool>(type: "boolean", nullable: false),
                    Permissions = table.Column<long>(type: "bigint", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_permission_roles", x => x.Id);
                    table.CheckConstraint("ck_permission_role", "\"Permissions\" BETWEEN 0 AND 262143 AND \"Position\" BETWEEN 0 AND 99 AND \"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_permission_roles_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "discorda",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "channel_permission_overwrites",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Allow = table.Column<long>(type: "bigint", nullable: false),
                    Deny = table.Column<long>(type: "bigint", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_channel_permission_overwrites", x => x.Id);
                    table.CheckConstraint("ck_channel_overwrite", "(\"RoleId\" IS NULL) <> (\"UserId\" IS NULL) AND \"Allow\" BETWEEN 0 AND 36863 AND \"Deny\" BETWEEN 0 AND 36863 AND ((\"Allow\" | \"Deny\") & 225280) = 0 AND (\"Allow\" & \"Deny\") = 0 AND \"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_channel_permission_overwrites_channels_ChannelId",
                        column: x => x.ChannelId,
                        principalSchema: "discorda",
                        principalTable: "channels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_channel_permission_overwrites_permission_roles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "discorda",
                        principalTable: "permission_roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_channel_permission_overwrites_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "member_permission_roles",
                schema: "discorda",
                columns: table => new
                {
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_member_permission_roles", x => new { x.RoleId, x.UserId });
                    table.ForeignKey(
                        name: "FK_member_permission_roles_permission_roles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "discorda",
                        principalTable: "permission_roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_member_permission_roles_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_channel_permission_overwrites_ChannelId_RoleId",
                schema: "discorda",
                table: "channel_permission_overwrites",
                columns: new[] { "ChannelId", "RoleId" },
                unique: true,
                filter: "\"RoleId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_channel_permission_overwrites_ChannelId_UserId",
                schema: "discorda",
                table: "channel_permission_overwrites",
                columns: new[] { "ChannelId", "UserId" },
                unique: true,
                filter: "\"UserId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_channel_permission_overwrites_RoleId",
                schema: "discorda",
                table: "channel_permission_overwrites",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_channel_permission_overwrites_UserId",
                schema: "discorda",
                table: "channel_permission_overwrites",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_member_permission_roles_UserId",
                schema: "discorda",
                table: "member_permission_roles",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_permission_roles_WorkspaceId_IsEveryone",
                schema: "discorda",
                table: "permission_roles",
                columns: new[] { "WorkspaceId", "IsEveryone" },
                unique: true,
                filter: "\"IsEveryone\" = true");
            migrationBuilder.Sql("""
                INSERT INTO discorda.permission_roles ("Id","WorkspaceId","Name","Color","Position","IsEveryone","Permissions","Version")
                SELECT gen_random_uuid(), "Id", '@todos', '#a6b2ff', 0, true, 3871, 1 FROM discorda.workspaces;
                INSERT INTO discorda.permission_roles ("Id","WorkspaceId","Name","Color","Position","IsEveryone","Permissions","Version")
                SELECT gen_random_uuid(), "Id", 'Administradores', '#c0a5ff', 90, false, 131072, 1 FROM discorda.workspaces;
                INSERT INTO discorda.permission_roles ("Id","WorkspaceId","Name","Color","Position","IsEveryone","Permissions","Version")
                SELECT gen_random_uuid(), "Id", 'Moderadores', '#6bc7a3', 50, false, 32800, 1 FROM discorda.workspaces;
                INSERT INTO discorda.member_permission_roles ("RoleId","UserId")
                SELECT r."Id",m."UserId" FROM discorda.workspace_members m JOIN discorda.permission_roles r ON r."WorkspaceId"=m."WorkspaceId"
                WHERE (m."Role"='Admin' AND r."Name"='Administradores') OR (m."Role"='Moderator' AND r."Name"='Moderadores');
                UPDATE discorda.workspace_members SET "Role"='Member',"PermissionVersion"="PermissionVersion"+1 WHERE "Role" IN ('Admin','Moderator');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "channel_permission_overwrites",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "member_permission_roles",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "permission_roles",
                schema: "discorda");

            migrationBuilder.DropColumn(
                name: "PermissionVersion",
                schema: "discorda",
                table: "workspace_members");
        }
    }
}
