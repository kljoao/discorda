using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AttachmentsThreadsTemporaryRooms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ThreadRootId",
                schema: "discorda",
                table: "messages",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EmptySince",
                schema: "discorda",
                table: "channels",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TemporaryOwnerId",
                schema: "discorda",
                table: "channels",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "message_attachments",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<long>(type: "bigint", nullable: false),
                    Name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false),
                    Size = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_message_attachments_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "discorda",
                        principalTable: "messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_messages_ChannelId_ThreadRootId_Id",
                schema: "discorda",
                table: "messages",
                columns: new[] { "ChannelId", "ThreadRootId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_messages_ThreadRootId",
                schema: "discorda",
                table: "messages",
                column: "ThreadRootId");

            migrationBuilder.CreateIndex(
                name: "IX_message_attachments_MessageId",
                schema: "discorda",
                table: "message_attachments",
                column: "MessageId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_messages_messages_ThreadRootId",
                schema: "discorda",
                table: "messages",
                column: "ThreadRootId",
                principalSchema: "discorda",
                principalTable: "messages",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_messages_messages_ThreadRootId",
                schema: "discorda",
                table: "messages");

            migrationBuilder.DropTable(
                name: "message_attachments",
                schema: "discorda");

            migrationBuilder.DropIndex(
                name: "IX_messages_ChannelId_ThreadRootId_Id",
                schema: "discorda",
                table: "messages");

            migrationBuilder.DropIndex(
                name: "IX_messages_ThreadRootId",
                schema: "discorda",
                table: "messages");

            migrationBuilder.DropColumn(
                name: "ThreadRootId",
                schema: "discorda",
                table: "messages");

            migrationBuilder.DropColumn(
                name: "EmptySince",
                schema: "discorda",
                table: "channels");

            migrationBuilder.DropColumn(
                name: "TemporaryOwnerId",
                schema: "discorda",
                table: "channels");
        }
    }
}
