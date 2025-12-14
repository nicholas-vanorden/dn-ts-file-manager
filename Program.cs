namespace FileManager {
    public class Program {
        public static void Main(string[] args) {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();

            // bind config ("FileManager:RootDirectory")
            builder.Services.Configure<FileManagerOptions>(
                builder.Configuration.GetSection("FileManager")
            );

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            app.UseHttpsRedirection();
            app.UseStaticFiles(new StaticFileOptions {
                ServeUnknownFileTypes = true // allows downloading any file
            });
            app.MapControllers();
            app.Run();
        }
    }

    public class FileManagerOptions {
        public string? RootDirectory { get; set; }
    }
}