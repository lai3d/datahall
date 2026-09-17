// DataHallNative：Unity macOS 程序用的原生功能，打开文件对话框和把文件拖进窗口。
// 构建：tools/build_native_mac.sh → unity/Assets/Plugins/macOS/DataHallNative.bundle（arm64 + x86_64）
// C# 侧见 unity/Assets/DataHall/Runtime/NativeMac.cs。所有函数都在主线程调用（Unity 在 macOS 上的主循环就是 AppKit 主线程）。
#import <Cocoa/Cocoa.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <objc/message.h>
#import <objc/runtime.h>

static NSString *droppedPath = nil;

int DataHallNative_Version(void) { return 1; }

void DataHallNative_Free(char *p) { free(p); }

static char *CopyPath(NSString *path) { return path ? strdup(path.fileSystemRepresentation) : NULL; }

// 模态文件对话框。extension 为空时不限类型；autoCancelSeconds > 0 时到时自动取消（冒烟测试用）。
// 返回选中文件的路径（用 DataHallNative_Free 释放），取消返回 NULL
char *DataHallNative_OpenFile(const char *message, const char *extension, double autoCancelSeconds) {
    @autoreleasepool {
        NSOpenPanel *panel = [NSOpenPanel openPanel];
        panel.canChooseFiles = YES;
        panel.canChooseDirectories = NO;
        panel.allowsMultipleSelection = NO;
        if (message) panel.message = [NSString stringWithUTF8String:message];
        if (extension && *extension) {
            UTType *type = [UTType typeWithFilenameExtension:[NSString stringWithUTF8String:extension]];
            if (type) panel.allowedContentTypes = @[type];
        }
        if (autoCancelSeconds > 0) {
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(autoCancelSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                [panel cancel:nil];
            });
        }
        if ([panel runModal] != NSModalResponseOK || panel.URLs.count == 0) return NULL;
        return CopyPath(panel.URLs.firstObject.path);
    }
}

// ---------- 拖放 ----------

static NSURL *FileURL(id<NSDraggingInfo> info) {
    NSArray<NSURL *> *urls = [info.draggingPasteboard readObjectsForClasses:@[NSURL.class]
                                                                    options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}];
    return urls.firstObject;
}

static NSDragOperation DH_draggingEntered(id self, SEL _cmd, id<NSDraggingInfo> info) {
    return FileURL(info) ? NSDragOperationCopy : NSDragOperationNone;
}

static BOOL DH_performDragOperation(id self, SEL _cmd, id<NSDraggingInfo> info) {
    NSURL *url = FileURL(info);
    if (!url) return NO;
    droppedPath = url.path;
    return YES;
}

static NSView *ContentView(void) {
    NSWindow *window = NSApp.mainWindow ?: NSApp.keyWindow ?: NSApp.windows.firstObject;
    return window.contentView;
}

// sel 是否由 cls 到 NSView 之间（不含 NSView）的类自己实现。NSView 本身带有拖放方法的默认实现，不算
static IMP OwnImplementation(Class cls, SEL sel) {
    for (Class c = cls; c && c != NSView.class; c = class_getSuperclass(c)) {
        unsigned int n = 0;
        Method *methods = class_copyMethodList(c, &n);
        IMP imp = NULL;
        for (unsigned int i = 0; i < n; i++) if (method_getName(methods[i]) == sel) { imp = method_getImplementation(methods[i]); break; }
        free(methods);
        if (imp) return imp;
    }
    return NULL;
}

// 给 Unity 窗口的内容视图注册文件拖放。Unity 自己的视图类没有实现拖放方法时，才在视图类上添加我们的实现（覆盖 NSView 的默认实现），
// Unity 已有实现则不接管。返回 1 已启用，0 窗口还没创建（稍后重试），-1 Unity 视图已有自己的拖放实现
int DataHallNative_EnableFileDrop(void) {
    @autoreleasepool {
        NSView *view = ContentView();
        if (!view) return 0;
        Class cls = object_getClass(view);
        IMP ours = (IMP)DH_performDragOperation;
        IMP existing = OwnImplementation(cls, @selector(performDragOperation:));
        if (existing && existing != ours) return -1;
        if (!existing) {
            NSString *op = [NSString stringWithFormat:@"%s%s%s%s", @encode(NSDragOperation), @encode(id), @encode(SEL), @encode(id)];
            NSString *perform = [NSString stringWithFormat:@"%s%s%s%s", @encode(BOOL), @encode(id), @encode(SEL), @encode(id)];
            class_addMethod(cls, @selector(draggingEntered:), (IMP)DH_draggingEntered, op.UTF8String);
            class_addMethod(cls, @selector(draggingUpdated:), (IMP)DH_draggingEntered, op.UTF8String);
            class_addMethod(cls, @selector(performDragOperation:), ours, perform.UTF8String);
        }
        [view registerForDraggedTypes:@[NSPasteboardTypeFileURL]];
        return 1;
    }
}

// 取出最近拖进来的文件路径（用 DataHallNative_Free 释放），没有返回 NULL
char *DataHallNative_PollDroppedFile(void) {
    NSString *path = droppedPath;
    droppedPath = nil;
    return CopyPath(path);
}

// ---------- 测试钩子 ----------

@interface DHFakeDraggingInfo : NSObject
@property (nonatomic, strong) NSPasteboard *draggingPasteboard;
@end
@implementation DHFakeDraggingInfo
@end

// 冒烟测试：用装有 path 文件 URL 的剪贴板，调用真实内容视图上的 performDragOperation:，
// 走一遍和真实拖放相同的代码（系统拖拽手势本身除外）。返回 1 视图接受了拖放
int DataHallNative_TestDrop(const char *path) {
    @autoreleasepool {
        NSView *view = ContentView();
        if (!view || ![view respondsToSelector:@selector(performDragOperation:)]) return 0;
        NSPasteboard *pasteboard = [NSPasteboard pasteboardWithUniqueName];
        [pasteboard clearContents];
        [pasteboard writeObjects:@[[NSURL fileURLWithPath:[NSString stringWithUTF8String:path]]]];
        DHFakeDraggingInfo *info = [DHFakeDraggingInfo new];
        info.draggingPasteboard = pasteboard;
        BOOL accepted = ((BOOL (*)(id, SEL, id))objc_msgSend)(view, @selector(performDragOperation:), info);
        [pasteboard releaseGlobally];
        return accepted ? 1 : 0;
    }
}

// 诊断：内容视图的类继承链、各拖放方法由哪个类实现、已注册的拖放类型、窗口类
char *DataHallNative_DescribeContentView(void) {
    @autoreleasepool {
        NSView *view = ContentView();
        if (!view) return strdup("no window");
        NSMutableString *s = [NSMutableString string];
        [s appendFormat:@"window=%@ view=", NSStringFromClass(object_getClass(view.window))];
        for (Class c = object_getClass(view); c; c = class_getSuperclass(c)) [s appendFormat:@"%@<", NSStringFromClass(c)];
        for (NSString *name in @[@"draggingEntered:", @"draggingUpdated:", @"performDragOperation:", @"prepareForDragOperation:", @"concludeDragOperation:"]) {
            SEL sel = NSSelectorFromString(name);
            Class owner = nil;
            for (Class c = object_getClass(view); c; c = class_getSuperclass(c)) {
                unsigned int n = 0; Method *list = class_copyMethodList(c, &n); BOOL found = NO;
                for (unsigned int i = 0; i < n; i++) if (method_getName(list[i]) == sel) { found = YES; break; }
                free(list);
                if (found) { owner = c; break; }
            }
            [s appendFormat:@" %@=%@", name, owner ? NSStringFromClass(owner) : @"-"];
        }
        [s appendFormat:@" types=%@", view.registeredDraggedTypes];
        return CopyPath(s);
    }
}
