// DataHallNative: native features for the Unity macOS app, an open-file dialog and dropping files onto the window.
// Build: tools/build_native_mac.sh → unity/Assets/Plugins/macOS/DataHallNative.bundle (arm64 + x86_64)
// C# side: unity/Assets/DataHall/Runtime/NativeMac.cs. All functions are called on the main thread (Unity's main loop on macOS is the AppKit main thread).
#import <Cocoa/Cocoa.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <objc/message.h>
#import <objc/runtime.h>

static NSString *droppedPath = nil;

int DataHallNative_Version(void) { return 1; }

void DataHallNative_Free(char *p) { free(p); }

static char *CopyPath(NSString *path) { return path ? strdup(path.fileSystemRepresentation) : NULL; }

// Modal file dialog. An empty extension allows any type; autoCancelSeconds > 0 cancels automatically after that time (for smoke tests).
// Returns the selected file's path (free with DataHallNative_Free), or NULL if cancelled
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

// ---------- Drag and drop ----------

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

// Whether sel is implemented by a class between cls and NSView (excluding NSView). NSView's own default drag-and-drop implementations do not count
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

// Register file drops on the Unity window's content view. Only when Unity's own view classes do not implement the drag methods do we add ours to the view class (overriding NSView's defaults);
// if Unity already implements them we do not take over. Returns 1 enabled, 0 window not created yet (retry later), -1 Unity's view has its own drag-and-drop implementation
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

// Takes the most recently dropped file path (free with DataHallNative_Free), or NULL if none
char *DataHallNative_PollDroppedFile(void) {
    NSString *path = droppedPath;
    droppedPath = nil;
    return CopyPath(path);
}

// ---------- Test hooks ----------

@interface DHFakeDraggingInfo : NSObject
@property (nonatomic, strong) NSPasteboard *draggingPasteboard;
@end
@implementation DHFakeDraggingInfo
@end

// Smoke test: call performDragOperation: on the real content view with a pasteboard holding the file URL for path,
// running the same code as a real drop (except the system drag gesture itself). Returns 1 if the view accepted the drop
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

// Diagnostics: the content view's class chain, which class implements each drag method, registered drag types, window class
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
