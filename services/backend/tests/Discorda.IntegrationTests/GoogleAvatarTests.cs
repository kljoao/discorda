using Discorda.Api.Auth;
namespace Discorda.IntegrationTests;
public sealed class GoogleAvatarTests
{
 [Theory]
 [InlineData("https://lh3.googleusercontent.com/a/photo")]
 [InlineData("https://googleusercontent.com/photo")]
 public void AcceptsGoogleHttpsPhotos(string url) => Assert.Equal(url,SupabaseIdentityClient.GoogleAvatar(url));
 [Theory]
 [InlineData("https://googleusercontent.com.evil.test/photo")]
 [InlineData("http://lh3.googleusercontent.com/a")]
 [InlineData("https://user@lh3.googleusercontent.com/a")]
 [InlineData("https://lh3.googleusercontent.com:8080/a")]
 [InlineData("file:///C:/private")]
 [InlineData("data:image/svg+xml,x")]
 [InlineData(null)]
 public void RejectsOtherOriginsAndSchemes(string? url) => Assert.Null(SupabaseIdentityClient.GoogleAvatar(url));
}
