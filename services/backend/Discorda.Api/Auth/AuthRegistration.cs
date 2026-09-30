using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Discorda.Api.Auth;

public static class AuthRegistration
{
    public static IServiceCollection AddDiscordaAuth(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SupabaseOptions>(configuration.GetSection("Supabase"));
        services.AddHttpClient<SupabaseIdentityClient>(client => client.Timeout = TimeSpan.FromSeconds(8))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<SupabaseOptions>>((options, configured) =>
            {
                var supabase = configured.Value;
                options.MapInboundClaims = false;
                options.IncludeErrorDetails = false;
                if (SupabaseOptions.IsValidUrl(supabase.Url))
                    options.MetadataAddress = supabase.Issuer + "/.well-known/openid-configuration";
                options.RequireHttpsMetadata = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = supabase.Issuer, ValidAudience = "authenticated",
                    ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true,
                    RequireExpirationTime = true, RequireSignedTokens = true, ValidateIssuerSigningKey = true,
                    ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256],
                    ClockSkew = TimeSpan.FromSeconds(30)
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        if (!Guid.TryParse(context.Principal?.FindFirst("sub")?.Value, out var subject)
                            || !Guid.TryParse(context.Principal.FindFirst("session_id")?.Value, out _)
                            || context.Principal.FindFirst("role")?.Value != "authenticated")
                        { context.Fail("Invalid identity"); return; }
                        var token = context.Request.Headers.Authorization.ToString()["Bearer ".Length..];
                        try
                        {
                            var identity = await context.HttpContext.RequestServices.GetRequiredService<SupabaseIdentityClient>()
                                .GetAsync(token, subject, context.HttpContext.RequestAborted);
                            if (identity is null) { context.Fail("Invalid identity"); return; }
                            context.HttpContext.Items[typeof(VerifiedIdentity)] = identity;
                        }
                        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
                        { context.Fail("Identity unavailable"); }
                    }
                };
            });
        services.AddHttpContextAccessor();
        services.AddScoped<MemberAccess>();
        services.AddScoped<IAuthorizationHandler, MemberHandler>();
        services.AddAuthorization(options =>
        {
            options.AddPolicy("Member", policy => policy.RequireAuthenticatedUser().AddRequirements(new MemberRequirement()));
            options.FallbackPolicy = options.GetPolicy("Member");
        });
        return services;
    }
}
