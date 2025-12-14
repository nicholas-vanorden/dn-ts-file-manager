using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace FileManager.Controllers {
    [ApiController]
    [Route("[controller]")]
    public class FilesController : ControllerBase {

        private readonly ILogger<FilesController> _logger;
        private readonly string _rootDirectory;

        public FilesController(ILogger<FilesController> logger, IOptions<FileManagerOptions> options)
        {
            _logger = logger;
            _rootDirectory = options.Value.RootDirectory 
                ?? throw new Exception("RootDirectory not set");
        }

        [HttpGet]
        public IActionResult Browse([FromQuery] string? path)
        {
            try
            {
                path = NormalizePath(path);
                var fullPath = Path.GetFullPath(Path.Combine(_rootDirectory, path));

                // if there's an issue with the path, reset to root
                if (path.Contains(':') ||
                    !fullPath.StartsWith(Path.GetFullPath(_rootDirectory)) ||
                    !Directory.Exists(fullPath))
                {
                    path = string.Empty;
                    fullPath = Path.GetFullPath(_rootDirectory);
                }

                var directories = Directory.GetDirectories(fullPath)
                    .Select(d => Path.GetFileName(d))
                    .OrderBy(n => n);

                var files = Directory.GetFiles(fullPath)
                    .Select(f => {
                        var fileInfo = new FileInfo(f);
                        return new
                        {
                            name = fileInfo.Name,
                            size = fileInfo.Length,
                            modified = fileInfo.LastWriteTimeUtc
                        };
                    })
                    .OrderBy(n => n.name);

                return Ok(new
                {
                    path,
                    fullPath,
                    parent = path.Contains('/') 
                        ? path[..path.LastIndexOf('/')] 
                        : null,
                    directories,
                    files
                });
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Browse failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("download")]
        public IActionResult Download([FromQuery] string? path)
        {
            try
            {
                path = NormalizePath(path);
                var fullPath = Path.GetFullPath(Path.Combine(_rootDirectory, path));
                var fileName = Path.GetFileName(fullPath);
                var contentType = "application/octet-stream";

                // if there's an issue with the path, return 404
                if (path.Contains(':') ||
                    !fullPath.StartsWith(Path.GetFullPath(_rootDirectory)) ||
                    !System.IO.File.Exists(fullPath))
                {
                    return NotFound();
                }

                return PhysicalFile(fullPath, contentType, fileName, enableRangeProcessing: true);
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Download failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("upload")]
        [RequestSizeLimit(1073741824)] // 1 GB
        public async Task<IActionResult> Upload([FromQuery] string path, IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "No file uploaded" });
                }

                path = NormalizePath(path);
                var targetDir = Path.GetFullPath(Path.Combine(_rootDirectory, path));

                // if there's an issue with the path, return 400
                if (path.Contains(':') ||
                    !targetDir.StartsWith(Path.GetFullPath(_rootDirectory)))
                {
                    return BadRequest(new { error = "Invalid path" });
                }

                if (!Directory.Exists(targetDir))
                {
                    return NotFound("Target directory does not exist");
                }

                var filePath = Path.Combine(targetDir, Path.GetFileName(file.FileName));

                // Optional: prevent overwrite
                if (System.IO.File.Exists(filePath))
                {
                    return Conflict("File already exists");
                }

                await using var stream = new FileStream(filePath, FileMode.CreateNew);
                await file.CopyToAsync(stream);

                return Ok(new { 
                    name = file.FileName, 
                    size = file.Length,
                    modified = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Upload failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private string NormalizePath(string? path)
        {
            path ??= string.Empty;
            return WebUtility.UrlDecode(path).Replace('\\', '/').Trim('/');
        }
    }
}