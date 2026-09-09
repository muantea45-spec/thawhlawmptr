using System;
using System.Diagnostics;
using System.IO;

class Program
{
    static void Main()
    {
        try
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            string ptrDir = Directory.Exists(Path.Combine(baseDir, "PTR")) ? Path.Combine(baseDir, "PTR") : baseDir;

            // Sync parent dist and server to PTR if running from parent
            if (baseDir != ptrDir)
            {
                string parentDist = Path.Combine(baseDir, "dist");
                string ptrDist = Path.Combine(ptrDir, "dist");
                string parentServer = Path.Combine(baseDir, "server");
                string ptrServer = Path.Combine(ptrDir, "server");

                if (Directory.Exists(parentDist))
                {
                    CopyDirectory(parentDist, ptrDist);
                }
                if (Directory.Exists(parentServer))
                {
                    CopyDirectory(parentServer, ptrServer);
                }
            }

            // Check for direct Electron binary in PTR or parent
            string electronExe = Path.Combine(ptrDir, "node_modules", "electron", "dist", "electron.exe");
            if (!File.Exists(electronExe))
            {
                electronExe = Path.Combine(baseDir, "node_modules", "electron", "dist", "electron.exe");
            }

            if (File.Exists(electronExe))
            {
                ProcessStartInfo electronPsi = new ProcessStartInfo();
                electronPsi.FileName = electronExe;
                electronPsi.Arguments = "\"" + ptrDir + "\"";
                electronPsi.WorkingDirectory = ptrDir;
                electronPsi.UseShellExecute = false;
                Process.Start(electronPsi);
                return;
            }

            // Fallback: Use PTR.bat
            string batFile = Path.Combine(ptrDir, "PTR.bat");
            if (!File.Exists(batFile))
            {
                batFile = Path.Combine(baseDir, "Start-PTR-App.bat");
            }

            if (File.Exists(batFile))
            {
                ProcessStartInfo batPsi = new ProcessStartInfo();
                batPsi.FileName = "cmd.exe";
                batPsi.Arguments = "/c \"" + batFile + "\"";
                batPsi.WorkingDirectory = ptrDir;
                batPsi.WindowStyle = ProcessWindowStyle.Hidden;
                batPsi.CreateNoWindow = true;
                batPsi.UseShellExecute = false;
                Process.Start(batPsi);
            }
        }
        catch (Exception)
        {
            // Silent fallback
        }
    }

    static void CopyDirectory(string sourceDir, string destinationDir)
    {
        try
        {
            Directory.CreateDirectory(destinationDir);
            foreach (string file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
            {
                string relativePath = file.Substring(sourceDir.Length + 1);
                string destFile = Path.Combine(destinationDir, relativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(destFile));
                File.Copy(file, destFile, true);
            }
        }
        catch { }
    }
}
