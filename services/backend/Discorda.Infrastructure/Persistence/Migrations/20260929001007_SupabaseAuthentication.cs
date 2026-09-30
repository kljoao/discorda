using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SupabaseAuthentication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_users_GoogleIssuer_GoogleSubject",
                schema: "discorda",
                table: "users");

            migrationBuilder.RenameColumn(
                name: "GoogleIssuer",
                schema: "discorda",
                table: "users",
                newName: "AuthIssuer");

            migrationBuilder.RenameColumn(
                name: "GoogleSubject",
                schema: "discorda",
                table: "users",
                newName: "AuthSubject");

            migrationBuilder.AlterColumn<string>(
                name: "AuthIssuer",
                schema: "discorda",
                table: "users",
                type: "character varying(256)",
                maxLength: 256,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.CreateTable(
                name: "access_audit",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_access_audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "application_sessions",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_application_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_application_sessions_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_users_AuthIssuer_AuthSubject",
                schema: "discorda",
                table: "users",
                columns: new[] { "AuthIssuer", "AuthSubject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_application_sessions_UserId",
                schema: "discorda",
                table: "application_sessions",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "access_audit",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "application_sessions",
                schema: "discorda");

            migrationBuilder.DropIndex(
                name: "IX_users_AuthIssuer_AuthSubject",
                schema: "discorda",
                table: "users");

            migrationBuilder.RenameColumn(
                name: "AuthIssuer",
                schema: "discorda",
                table: "users",
                newName: "GoogleIssuer");

            migrationBuilder.RenameColumn(
                name: "AuthSubject",
                schema: "discorda",
                table: "users",
                newName: "GoogleSubject");

            migrationBuilder.AlterColumn<string>(
                name: "GoogleIssuer",
                schema: "discorda",
                table: "users",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(256)",
                oldMaxLength: 256);

            migrationBuilder.CreateIndex(
                name: "IX_users_GoogleIssuer_GoogleSubject",
                schema: "discorda",
                table: "users",
                columns: new[] { "GoogleIssuer", "GoogleSubject" },
                unique: true);
        }
    }
}
