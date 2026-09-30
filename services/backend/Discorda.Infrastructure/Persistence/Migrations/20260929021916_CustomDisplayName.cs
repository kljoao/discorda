using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomDisplayName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomDisplayName",
                schema: "discorda",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CustomDisplayName",
                schema: "discorda",
                table: "users");
        }
    }
}
