using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace FileManager.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class FilesController : ControllerBase
    {
        private readonly ILogger<FilesController> _logger;
        private readonly string _rootDirectory;

        public FilesController(ILogger<FilesController> logger, IOptions<FileManagerOptions> options)
        {
            _logger = logger;
            _rootDirectory = options.Value.RootDirectory 
                ?? throw new Exception("RootDirectory not set");
        }

        /// <summary>
        /// Browse directories and list files
        /// </summary>
        /// <param name="path">The path relative to the root directory</param>
        /// <returns>JSON object with directories and files
        /// structure:
        /// {
        ///   "path": "current/relative/path",
        ///   "fullPath": "C:/absolute/path/to/current/relative/path",
        ///   "parent": "current/relative", // null if at root
        ///   "directories": [ "subdir1", "subdir2", ... ],
        ///   "files": [
        ///    {
        ///      "name": "file1.txt",
        ///      "size": 1024,
        ///      "modified": "2023-01-01T00:00:00Z"
        ///    },
        ///     ...
        ///   ]
        /// }
        /// </returns>
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
                    _logger.LogWarning("Invalid path requested: {path}", path);

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

        /// <summary>
        /// Download a file
        /// </summary>
        /// <param name="path">Relative path to the file</param>
        /// <returns>Physical file content</returns>
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
                    _logger.LogWarning("Invalid download path requested: {path}", path);
                    return NotFound();
                }

                _logger.LogInformation("File downloaded: {fullPath}", fullPath);
                return PhysicalFile(fullPath, contentType, fileName, enableRangeProcessing: true);
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Download failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Upload a file
        /// </summary>
        /// <param name="path">Relative path to the target directory</param>
        /// <param name="file">The file to upload</param>
        /// <returns>HTTP 200 OK on success, HTTP 400 Bad Request on invalid path, HTTP 409 Conflict if file already exists</returns>
        [HttpPost("upload")]
        [RequestSizeLimit(1073741824)] // 1 GB
        public async Task<IActionResult> Upload([FromQuery] string? path, IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    _logger.LogWarning("Upload attempted with no file");
                    return BadRequest(new { error = "No file uploaded" });
                }

                path = NormalizePath(path);
                var targetDir = Path.GetFullPath(Path.Combine(_rootDirectory, path));

                // if there's an issue with the path, return 400
                if (path.Contains(':') ||
                    !targetDir.StartsWith(Path.GetFullPath(_rootDirectory)) ||
                    !Directory.Exists(targetDir))
                {
                    _logger.LogWarning("Invalid upload path: {path}", path);
                    return BadRequest(new { error = "Invalid path" });
                }

                var filePath = Path.Combine(targetDir, Path.GetFileName(file.FileName));

                if (System.IO.File.Exists(filePath))
                {
                    _logger.LogWarning("Upload conflict: file already exists at {filePath}", filePath);
                    return Conflict("File already exists");
                }

                await using var stream = new FileStream(filePath, FileMode.CreateNew);
                await file.CopyToAsync(stream);

                _logger.LogInformation("File uploaded: {filePath}", filePath);
                return Ok();
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Upload failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Create a new folder
        /// </summary>
        /// <param name="path">Relative path to the target directory</param>
        /// <param name="name">Name of the new folder</param>
        /// <returns>HTTP 200 OK on success, HTTP 400 Bad Request on invalid path, HTTP 409 Conflict if folder already exists</returns>
        [HttpPost("mkdir")]
        public IActionResult CreateFolder([FromQuery] string? path, [FromQuery] string name)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(name))
                {
                    name = "New Folder";
                }

                path = NormalizePath(path);
                
                var targetDir = Path.GetFullPath(Path.Combine(_rootDirectory, path));

                if (path.Contains(':') ||
                    !targetDir.StartsWith(Path.GetFullPath(_rootDirectory)) ||
                    !Directory.Exists(targetDir))
                {
                    _logger.LogWarning("Invalid path for CreateFolder: {path}", path);
                    return BadRequest("Invalid path");
                }

                var newDir = Path.Combine(targetDir, name);

                if (Directory.Exists(newDir))
                {
                    _logger.LogWarning("CreateFolder conflict: folder already exists at {newDir}", newDir);
                    return Conflict("Folder already exists");
                }

                Directory.CreateDirectory(newDir);

                _logger.LogInformation("Folder created: {newDir}", newDir);
                return Ok();
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "CreateFolder failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        /// <summary>
        /// Rename a file or directory
        /// </summary>
        /// <param name="path">Relative path to the target directory</param>
        /// <param name="oldName">Current name of the file or directory</param>
        /// <param name="newName">New name for the file or directory</param>
        /// <returns>HTTP 200 OK on success, HTTP 400 Bad Request on invalid parameters, HTTP 404 Not Found if source does not exist, HTTP 409 Conflict if target already exists</returns>
        [HttpPost("rename")]
        public IActionResult Rename([FromQuery] string? path, [FromQuery] string oldName, [FromQuery] string newName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(oldName) || string.IsNullOrWhiteSpace(newName))
                {
                    _logger.LogWarning("Invalid names for Rename: oldName='{oldName}', newName='{newName}'", oldName, newName);
                    return BadRequest("Invalid names");
                }

                path = NormalizePath(path);
                var targetDir = Path.GetFullPath(Path.Combine(_rootDirectory, path));

                if (path.Contains(':') ||
                    !targetDir.StartsWith(Path.GetFullPath(_rootDirectory)) ||
                    !Directory.Exists(targetDir))
                {
                    _logger.LogWarning("Invalid path for Rename: {path}", path);
                    return BadRequest("Invalid path");
                }

                var source = Path.Combine(targetDir, oldName);
                var target = Path.Combine(targetDir, newName);

                if (!System.IO.File.Exists(source) && !Directory.Exists(source))
                {
                    _logger.LogWarning("Rename source does not exist: {source}", source);
                    return NotFound("Source does not exist");
                }

                if (System.IO.File.Exists(target) || Directory.Exists(target))
                {
                    _logger.LogWarning("Rename conflict: target already exists at {target}", target);
                    return Conflict("Target already exists");
                }

                if (System.IO.File.Exists(source))
                {
                    System.IO.File.Move(source, target);
                }
                else
                {
                    Directory.Move(source, target);
                }

                _logger.LogInformation("Renamed '{source}' to '{target}'", source, target);
                return Ok();
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Rename failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        /// <summary>
        /// Delete a file or directory
        /// </summary>
        /// <param name="path">Relative path to the target directory</param>
        /// <param name="name">Name of the file or directory to delete</param>
        /// <param name="type">Type of item to delete ('file' or 'dir')</param>
        /// <returns>HTTP 200 OK on success, HTTP 400 Bad Request on invalid parameters, HTTP 404 Not Found if item does not exist</returns>
        [HttpPost("delete")]
        public IActionResult Delete([FromQuery] string? path, [FromQuery] string name, [FromQuery] string type)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(name) || (type != "file" && type != "dir"))
                {
                    _logger.LogWarning(
                        "Invalid parameters for Delete: name='{name}', type='{type}'. Type must be 'file' or 'dir'",
                        name, type);
                    return BadRequest("Invalid parameters");
                }

                path = NormalizePath(path);
                var targetDir = Path.GetFullPath(Path.Combine(_rootDirectory, path));

                if (path.Contains(':') ||
                    !targetDir.StartsWith(Path.GetFullPath(_rootDirectory)) ||
                    !Directory.Exists(targetDir))
                {
                    _logger.LogWarning("Invalid path for Delete: {path}", path);
                    return BadRequest("Invalid path");
                }

                var target = Path.Combine(targetDir, name);

                if (type == "file")
                {
                    if (!System.IO.File.Exists(target))
                    {
                        _logger.LogWarning("Delete file does not exist: {target}", target);
                        return NotFound("File does not exist");
                    }
                    System.IO.File.Delete(target);
                }
                else
                {
                    if (!Directory.Exists(target))
                    {
                        _logger.LogWarning("Delete directory does not exist: {target}", target);
                        return NotFound("Directory does not exist");
                    }
                    DeleteDirectorySafely(target);
                }

                _logger.LogInformation("Deleted {type} at '{target}'", type, target);
                return Ok();
            }
            catch (Exception ex)
            {
                 _logger.LogError(ex, "Delete failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        private string NormalizePath(string? path)
        {
            path ??= string.Empty;
            return WebUtility.UrlDecode(path).Replace('\\', '/').Trim('/');
        }

        private void DeleteDirectorySafely(string path)
        {
            if (!Directory.Exists(path))
            {
                return;
            }

            foreach (var file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
            {
                System.IO.File.SetAttributes(file, FileAttributes.Normal);
            }

            foreach (var dir in Directory.GetDirectories(path, "*", SearchOption.AllDirectories))
            {
                System.IO.File.SetAttributes(dir, FileAttributes.Normal);
            }

            Directory.Delete(path, recursive: true);
        }
    }
}