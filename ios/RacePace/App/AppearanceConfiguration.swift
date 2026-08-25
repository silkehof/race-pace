import SwiftUI
import UIKit

/// Configures UIKit chrome (nav bar, tab bar) that SwiftUI doesn't expose per-view modifiers for.
/// Applied once at launch so every screen gets a rounded, bold title font instead of the default
/// system large-title font, and an opaque canvas-tinted bar instead of the default translucent
/// blur — small things, but they're most of what makes a SwiftUI app read as "just the system
/// defaults" versus feeling like its own product.
enum AppearanceConfiguration {
    static func apply() {
        let navBar = UINavigationBarAppearance()
        navBar.configureWithOpaqueBackground()
        navBar.backgroundColor = UIColor(Color.racePaceCanvas)
        navBar.shadowColor = .clear
        navBar.largeTitleTextAttributes = [.font: roundedFont(textStyle: .largeTitle)]
        navBar.titleTextAttributes = [.font: roundedFont(textStyle: .headline)]
        UINavigationBar.appearance().standardAppearance = navBar
        UINavigationBar.appearance().scrollEdgeAppearance = navBar
        UINavigationBar.appearance().compactAppearance = navBar

        let tabBar = UITabBarAppearance()
        tabBar.configureWithOpaqueBackground()
        tabBar.backgroundColor = UIColor(Color.racePaceCard)
        tabBar.shadowColor = UIColor(Color.primary.opacity(0.08))
        UITabBar.appearance().standardAppearance = tabBar
        UITabBar.appearance().scrollEdgeAppearance = tabBar
    }

    private static func roundedFont(textStyle: UIFont.TextStyle) -> UIFont {
        let base = UIFontDescriptor.preferredFontDescriptor(withTextStyle: textStyle)
        let rounded = base.withDesign(.rounded)?.withSymbolicTraits(.traitBold) ?? base
        return UIFont(descriptor: rounded, size: base.pointSize)
    }
}
