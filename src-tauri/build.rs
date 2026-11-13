fn main() {
    // 自定义 Windows manifest：requestAdministrator。
    // ETW 帧率采集与 PawnIO 温度传感都要求管理员令牌，普通权限下 FPS=0、温度/功耗为 null。
    // （官方示例写法：WindowsAttributes::app_manifest 整体替换 tauri 生成的 manifest）
    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
      <security>
          <requestedPrivileges>
              <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
          </requestedPrivileges>
      </security>
  </trustInfo>
</assembly>
"#);
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("failed to run build script");
}
