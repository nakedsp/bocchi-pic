document.addEventListener('DOMContentLoaded', () => {
  // AWS S3 客户端
  let s3Client = null;
  
  // 获取元素引用
  const dropArea = document.getElementById('dropArea');
  const fileInput = document.getElementById('fileInput');
  const selectBtn = document.getElementById('selectBtn');
  const previewContainer = document.getElementById('preview-container');
  const preview = document.getElementById('preview');
  const resultContainer = document.getElementById('resultContainer');
  const resultImage = document.getElementById('resultImage');
  const openOriginal = document.getElementById('openOriginal');
  const directUrl = document.getElementById('directUrl');
  const markdownUrl = document.getElementById('markdownUrl');
  const htmlUrl = document.getElementById('htmlUrl');
  const bbcodeUrl = document.getElementById('bbcodeUrl');
  const toast = document.getElementById('toast');
  const loading = document.getElementById('loading');
  const autoCopyToggle = document.getElementById('autoCopy');
  
  // 设置元素
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const s3EndpointInput = document.getElementById('s3Endpoint');
  const accessKeyIdInput = document.getElementById('accessKeyId');
  const secretAccessKeyInput = document.getElementById('secretAccessKey');
  const bucketNameInput = document.getElementById('bucketName');
  const folderNameInput = document.getElementById('folderName');
  const customDomainInput = document.getElementById('customDomain');
  
  // 文件格式复选框
  const formatCheckboxes = document.querySelectorAll('.format-toggle input[type="checkbox"]');
  
  // 默认设置
  const defaultSettings = {
    s3Endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    folderName: 'bocchipic',
    customDomain: '',
    allowedFormats: {
      'jpg': true,
      'jpeg': true,
      'png': true,
      'gif': true,
      'webp': true,
      'svg': true,
      'bmp': false,
      'ico': false,
      'tiff': false
    }
  };
  
  // 加载设置
  loadSettings();
  // 加载背景图片
  loadBackgroundImage();
  
  // 切换设置面板
  settingsToggle.addEventListener('click', () => {
    if (settingsPanel.style.display === 'block') {
      settingsPanel.style.display = 'none';
    } else {
      settingsPanel.style.display = 'block';
    }
  });
  
  // 保存设置
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  // 上传功能
  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  
  dropArea.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', handleFiles);
  
  // 拖放功能
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });
  
  function highlight() {
    dropArea.style.borderColor = 'var(--bocchi-pink)';
    dropArea.style.backgroundColor = 'var(--bocchi-pink-alpha)';
    dropArea.style.boxShadow = '0 0 0 5px var(--bocchi-pink-alpha)';
  }
  
  function unhighlight() {
    dropArea.style.borderColor = '';
    dropArea.style.backgroundColor = '';
    dropArea.style.boxShadow = '';
  }
  
  dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles({target: {files}});
  });
  
  // 处理文件上传
  function handleFiles(e) {
    const files = e.target.files;
    if (files.length === 0) return;
    
    // 获取存储的设置
    const settings = getSettings();
    
    // 检查设置是否完整
    if (!settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName || !settings.s3Endpoint) {
      showToast('请先完成S3设置');
      settingsPanel.style.display = 'block';
      return;
    }
    
    // 根据允许的格式过滤文件
    const validFiles = Array.from(files).filter(file => {
      const fileExtension = file.name.split('.').pop().toLowerCase();
      return settings.allowedFormats[fileExtension];
    });
    
    if (validFiles.length === 0) {
      showToast('没有符合允许格式的文件！');
      return;
    }
    
    if (validFiles.length !== files.length) {
      showToast(`已过滤 ${files.length - validFiles.length} 个不支持的文件格式`);
    }
    
    // 显示预览容器
    previewContainer.style.display = 'block';
    // 隐藏之前的结果
    resultContainer.style.display = 'none';
    
    preview.innerHTML = '';
    
    // 处理每个文件
    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        // 创建预览项
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.style.animationDelay = `${index * 0.1}s`;
        
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'preview-img';
        img.alt = file.name;
        
        const info = document.createElement('div');
        info.className = 'preview-info';
        info.textContent = file.name.length > 20 
          ? file.name.substring(0, 17) + '...' 
          : file.name;
        
        previewItem.appendChild(img);
        previewItem.appendChild(info);
        preview.appendChild(previewItem);
        
        // 上传第一张图片
        if (index === 0) {
          // 初始化S3客户端
          if (!initS3Client()) {
            showToast('S3客户端初始化失败，请检查设置');
            return;
          }
          
          uploadToS3(file);
        }
      };
      
      reader.readAsDataURL(file);
    });
  }
  
  // 上传到S3
  async function uploadToS3(file) {
    try {
      // 显示加载遮罩
      loading.classList.add('show');
      
      // 获取设置
      const settings = getSettings();
      
      // 检查S3客户端是否初始化
      if (!s3Client) {
        if (!initS3Client()) {
          throw new Error('S3客户端初始化失败');
        }
      }
      
      // 生成唯一文件名
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const originalName = file.name;
      const extension = originalName.split('.').pop().toLowerCase();
      const uniqueName = `${timestamp}-${randomString}.${extension}`;
      
      // 完整对象键（包含文件夹）
      const objectKey = `${settings.folderName}/${uniqueName}`;
      
      // 设置合适的Content-Type
      let contentType = 'image/jpeg';
      switch (extension) {
        case 'png':
          contentType = 'image/png';
          break;
        case 'gif':
          contentType = 'image/gif';
          break;
        case 'webp':
          contentType = 'image/webp';
          break;
        case 'svg':
          contentType = 'image/svg+xml';
          break;
        case 'bmp':
          contentType = 'image/bmp';
          break;
        case 'ico':
          contentType = 'image/x-icon';
          break;
        case 'tiff':
        case 'tif':
          contentType = 'image/tiff';
          break;
      }
      
      // 上传参数
      const params = {
        Bucket: settings.bucketName,
        Key: objectKey,
        Body: file,
        ContentType: contentType,
        ACL: 'public-read'
      };
      
      console.log('准备上传文件:', {
        bucket: settings.bucketName,
        key: objectKey,
        contentType: contentType
      });
      
      // 确保文件夹存在
      await ensureFolderExists(settings.folderName);
      
      // 上传文件
      const uploadResult = await s3Client.upload(params).promise();
      console.log('上传成功:', uploadResult);
      
      // 生成URL - 修正的URL生成逻辑
      let fileUrl;
      if (settings.customDomain) {
        // 如果有斜杠结尾则移除
        const domain = settings.customDomain.endsWith('/') 
          ? settings.customDomain.slice(0, -1) 
          : settings.customDomain;
        // 正确的URL路径应该包含存储桶名称和文件夹名称
        fileUrl = `${domain}/${settings.bucketName}/${settings.folderName}/${uniqueName}`;
      } else {
        // 使用默认S3 URL格式
        fileUrl = `${settings.s3Endpoint.replace(/\/$/, '')}/${settings.bucketName}/${settings.folderName}/${uniqueName}`;
      }
      
      // 隐藏加载遮罩
      loading.classList.remove('show');
      
      // 显示结果
      displayResult(fileUrl, file.name);
      
      // 如果启用自动复制
      if (autoCopyToggle.checked) {
        try {
          await navigator.clipboard.writeText(fileUrl);
          showToast('已自动复制图片链接！');
        } catch (err) {
          console.error('Auto copy failed:', err);
        }
      }
    } catch (error) {
      console.error('Error uploading to S3:', error);
      loading.classList.remove('show');
      showToast('上传失败: ' + error.message);
    }
  }
  
  // 确保文件夹存在
  async function ensureFolderExists(folderName) {
    try {
      const settings = getSettings();
      
      // 检查文件夹是否存在
      const listParams = {
        Bucket: settings.bucketName,
        Prefix: `${folderName}/`,
        MaxKeys: 1
      };
      
      const listResult = await s3Client.listObjectsV2(listParams).promise();
      
      // 如果文件夹不存在，就创建它
      if (!listResult.Contents || listResult.Contents.length === 0) {
        const createParams = {
          Bucket: settings.bucketName,
          Key: `${folderName}/`,
          Body: '',
          ContentType: 'application/x-directory'
        };
        
        await s3Client.upload(createParams).promise();
        console.log(`文件夹 ${folderName} 创建成功`);
      }
    } catch (error) {
      console.error('Error ensuring folder exists:', error);
      // 继续操作 - 文件夹会在上传文件时隐式创建
    }
  }
  
  // 显示结果
  function displayResult(url, filename) {
    // 设置结果图片
    resultImage.src = url;
    resultImage.alt = filename;
    
    // 设置原始链接
    openOriginal.href = url;
    
    // 设置各种链接格式
    directUrl.value = url;
    markdownUrl.value = `![${filename}](${url})`;
    htmlUrl.value = `<img src="${url}" alt="${filename}" />`;
    bbcodeUrl.value = `[img]${url}[/img]`;
    
    // 显示结果容器
    resultContainer.style.display = 'block';
    
    // 滚动到结果区域
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  // 加载背景图片
  async function loadBackgroundImage() {
    try {
      const response = await fetch('https://www.loliapi.com/acg/');
      
      if (!response.ok) {
        throw new Error('Failed to load background image');
      }
      
      // 直接使用响应URL
      const backgroundUrl = response.url;
      document.querySelector('.background-overlay').style.backgroundImage = `url(${backgroundUrl})`;
    } catch (error) {
      console.error('Error loading background image:', error);
      // 使用默认渐变背景
      document.querySelector('.background-overlay').style.backgroundImage = 'linear-gradient(135deg, var(--bocchi-pink-light), var(--bocchi-pink))';
    }
  }
  
  // 初始化S3客户端
  function initS3Client() {
    try {
      const settings = getSettings();
      
      // 验证必要设置
      if (!settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName || !settings.s3Endpoint) {
        throw new Error('请在设置中填写完整的访问密钥、密钥和S3端点信息');
      }
      
      // 配置AWS
      AWS.config.update({
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
        region: 'auto'
      });
      
      // 创建S3客户端 - 使用用户提供的端点
      s3Client = new AWS.S3({
        endpoint: settings.s3Endpoint,
        signatureVersion: 'v4',
        s3ForcePathStyle: true
      });
      
      return true;
    } catch (error) {
      console.error('Error initializing S3 client:', error);
      showToast('S3客户端初始化失败: ' + error.message);
      return false;
    }
  }
  
  // 从localStorage加载设置
  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem('bocchiImageSettings');
      let settings;
      
      if (savedSettings) {
        settings = JSON.parse(savedSettings);
      } else {
        settings = defaultSettings;
        localStorage.setItem('bocchiImageSettings', JSON.stringify(settings));
      }
      
      // 填充表单字段 - 除了folderName以外不填充默认值
      s3EndpointInput.value = settings.s3Endpoint || '';
      accessKeyIdInput.value = settings.accessKeyId || '';
      secretAccessKeyInput.value = settings.secretAccessKey || '';
      bucketNameInput.value = settings.bucketName || '';
      folderNameInput.value = settings.folderName || 'bocchipic';
      customDomainInput.value = settings.customDomain || '';
      
      // 设置格式复选框
      formatCheckboxes.forEach(checkbox => {
        const format = checkbox.id.split('-')[1];
        checkbox.checked = settings.allowedFormats ? settings.allowedFormats[format] : true;
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      // 使用默认设置
      resetToDefaultSettings();
    }
  }
  
  // 保存设置到localStorage
  function saveSettings() {
    try {
      const settings = {
        s3Endpoint: s3EndpointInput.value.trim(),
        accessKeyId: accessKeyIdInput.value.trim(),
        secretAccessKey: secretAccessKeyInput.value.trim(),
        bucketName: bucketNameInput.value.trim(),
        folderName: folderNameInput.value.trim() || 'bocchipic',
        customDomain: customDomainInput.value.trim(),
        allowedFormats: {}
      };
      
      // 获取格式设置
      formatCheckboxes.forEach(checkbox => {
        const format = checkbox.id.split('-')[1];
        settings.allowedFormats[format] = checkbox.checked;
      });
      
      // 验证必填字段
      if (!settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName || !settings.s3Endpoint) {
        showToast('请填写所有必要的设置信息');
        return;
      }
      
      // 保存到localStorage
      localStorage.setItem('bocchiImageSettings', JSON.stringify(settings));
      
      // 重新初始化S3客户端
      initS3Client();
      
      // 隐藏设置面板
      settingsPanel.style.display = 'none';
      
      showToast('设置已保存');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('保存设置失败');
    }
  }
  
  // 重置为默认设置
  function resetToDefaultSettings() {
    localStorage.setItem('bocchiImageSettings', JSON.stringify(defaultSettings));
    loadSettings();
  }
  
  // 获取当前设置
  function getSettings() {
    try {
      const savedSettings = localStorage.getItem('bocchiImageSettings');
      return savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    } catch (error) {
      console.error('Error getting settings:', error);
      return defaultSettings;
    }
  }
});

// 复制文本到剪贴板
function copyText(elementId) {
  const element = document.getElementById(elementId);
  element.select();
  
  navigator.clipboard.writeText(element.value).then(() => {
    showToast('复制成功！');
  }).catch(err => {
    console.error('Clipboard write failed:', err);
    // 备用方法
    document.execCommand('copy');
    showToast('复制成功！');
  });
}

// 显示提示信息
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}