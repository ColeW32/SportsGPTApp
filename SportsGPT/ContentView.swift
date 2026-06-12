//
//  ContentView.swift
//  SportsGPT
//
//  Created by Jason Schubert on 4/8/26.
//

import StoreKit
import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("hasSeenIntroExperience") private var hasSeenIntroExperience = false
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @StateObject private var viewModel = SportsGPTViewModel()
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @StateObject private var subscriptionStore = SubscriptionStore()
    @FocusState private var isComposerFocused: Bool
    @State private var thinkingIndex = 0
    @State private var isFilterSheetPresented = false
    @State private var isMenuPresented = false
    @State private var isLegalPresented = false
    @State private var onboardingState = OnboardingState()
    @State private var isShowingLaunchScreen = true
    @State private var hasPerformedInitialLoad = false

    private let thinkingPhrases = [
        "Comparing books for the cleanest number",
        "Scanning live market context",
        "Looking for a bet worth making",
        "Ranking the sharpest available angles",
        "Turning the board into a clean answer"
    ]

    var body: some View {
        ZStack {
            SportsGPTPalette.background
                .ignoresSafeArea()

            backgroundGlow

            VStack(spacing: 14) {
                Color.clear
                    .frame(height: 58)
                chatSurface
                composer
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 10)

            VStack {
                header
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 4)

            if isShowingLaunchScreen {
                SportsGPTLaunchScreen()
                .transition(.opacity)
                .zIndex(20)
            }
        }
        .task {
            if !hasPerformedInitialLoad {
                hasPerformedInitialLoad = true
                await performInitialLoad()
            }
        }
        .onChange(of: viewModel.selectedSportsbooks) { _ in
            Task {
                await viewModel.loadSuggestedPrompts()
            }
        }
        .onChange(of: scenePhase) { newPhase in
            guard newPhase == .active else { return }
            Task {
                await subscriptionStore.refreshSubscriptionState()
            }
        }
        .onReceive(viewModel.thinkingTimer) { _ in
            withAnimation(.spring(duration: 0.4)) {
                if viewModel.isLoading {
                    thinkingIndex = (thinkingIndex + 1) % thinkingPhrases.count
                }
            }
        }
        .onChange(of: subscriptionStore.isPaywallPresented) { isPresented in
            guard !isPresented, hasCompletedOnboarding else { return }
            Task {
                await focusComposerIfNeeded(after: .milliseconds(220))
            }
        }
        .alert("Something Went Wrong", isPresented: errorBinding) {
            Button("OK", role: .cancel) {
                viewModel.dismissError()
            }
        } message: {
            Text(viewModel.errorMessage ?? "Something went wrong.")
        }
        .fullScreenCover(isPresented: $isFilterSheetPresented) {
            SportsbookFilterSheet(selectedSportsbooks: $viewModel.selectedSportsbooks)
        }
        .fullScreenCover(isPresented: $subscriptionStore.isPaywallPresented) {
            PaywallView(subscriptionStore: subscriptionStore)
        }
        .sheet(isPresented: $subscriptionStore.isAdPreferencesPresented) {
            AdPreferencesView(subscriptionStore: subscriptionStore)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $subscriptionStore.isAccountSettingsPresented) {
            AccountSettingsView(subscriptionStore: subscriptionStore)
        }
        .sheet(isPresented: $isLegalPresented) {
            LegalView()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: introPresentationBinding) {
            IntroLandingView {
                hasSeenIntroExperience = true
            }
            .interactiveDismissDisabled()
        }
        .fullScreenCover(isPresented: launchAwareOnboardingBinding) {
            OnboardingFlowView(
                state: $onboardingState,
                onComplete: completeOnboarding
            )
            .interactiveDismissDisabled()
        }
    }

    private var header: some View {
        HStack {
            Button {
                if !subscriptionStore.isPremium {
                    subscriptionStore.presentPaywall()
                }
            } label: {
                Text("SportsGPT")
                    .font(.custom("Avenir Next", size: 24))
                    .fontWeight(.medium)
                    .tracking(0.2)
                    .foregroundStyle(SportsGPTPalette.headerText)
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                isFilterSheetPresented = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .font(.system(size: 15, weight: .semibold))

                    Text(viewModel.sportsbookSummary)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(SportsGPTPalette.headerText)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    Capsule(style: .continuous)
                        .fill(Color.white.opacity(0.06))
                )
            }

            Button {
                withAnimation(.spring(duration: 0.35)) {
                    isMenuPresented.toggle()
                }
            } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(SportsGPTPalette.ink)
                    .frame(width: 42, height: 42)
                    .background(
                        Circle()
                            .fill(SportsGPTPalette.card)
                    )
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(SportsGPTPalette.headerBar)
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        )
        .shadow(color: Color.black.opacity(0.08), radius: 8, y: 4)
        .overlay(alignment: .topTrailing) {
            if isMenuPresented {
                RightSideMenu(
                    subscriptionStore: subscriptionStore,
                    isPresented: $isMenuPresented,
                    onOpenLegal: {
                        isLegalPresented = true
                    }
                )
                .offset(x: 0, y: 76)
                .transition(.move(edge: .trailing).combined(with: .opacity))
                .zIndex(2)
            }
        }
    }

    private var chatSurface: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    if viewModel.shouldShowSuggestedPrompts {
                        SuggestedPromptsRow(
                            prompts: viewModel.suggestedPrompts,
                            onSelect: { prompt in
                                Task {
                                    await sendSuggestedPrompt(prompt)
                                }
                            }
                        )
                    }

                    if viewModel.shouldShowSuggestedPromptLoading {
                        SuggestedPromptsLoadingRow()
                    }

                    ForEach(viewModel.messages) { message in
                        ChatBubble(message: message, shouldShowAd: subscriptionStore.areChatAdsEnabled)
                            .id(message.id)
                            .transition(.asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .opacity
                            ))
                    }

                    if viewModel.isLoading {
                        ThinkingBubble(text: thinkingPhrases[thinkingIndex % thinkingPhrases.count])
                    }
                }
                .padding(16)
            }
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(SportsGPTPalette.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(SportsGPTPalette.border, lineWidth: 1)
                    )
                    .shadow(color: SportsGPTPalette.shadow, radius: 24, y: 18)
            )
            .onChange(of: viewModel.messages.count) { _ in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: viewModel.isLoading) { _ in
                scrollToBottom(proxy: proxy)
            }
            .animation(.spring(duration: 0.35), value: viewModel.isLoading)
        }
    }

    private var composer: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                ZStack(alignment: .topLeading) {
                    if viewModel.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("What's the best bet today?")
                            .font(.system(size: 16, weight: .medium, design: .rounded))
                            .italic()
                            .foregroundStyle(SportsGPTPalette.composerPlaceholder)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 1)
                            .allowsHitTesting(false)
                    }

                    TextField(
                        "",
                        text: $viewModel.input,
                        axis: .vertical
                    )
                    .textFieldStyle(.plain)
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.composerText)
                    .tint(SportsGPTPalette.composerText)
                    .lineLimit(2...5)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 2)
                    .focused($isComposerFocused)
                    .submitLabel(.send)
                    .onSubmit(sendMessage)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if speechRecognizer.isRecording || viewModel.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(action: toggleRecording) {
                        ZStack {
                            Circle()
                                .fill(speechRecognizer.isRecording ? Color(red: 0.93, green: 0.42, blue: 0.33) : SportsGPTPalette.softPanel)
                                .frame(width: 50, height: 50)

                            Image(systemName: speechRecognizer.isRecording ? "stop.fill" : "mic.fill")
                                .font(.system(size: 18, weight: .black))
                                .foregroundStyle(speechRecognizer.isRecording ? SportsGPTPalette.headerText : SportsGPTPalette.ink)
                        }
                    }
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
                    .scaleEffect(speechRecognizer.isRecording ? 1.02 : 1)
                    .animation(.spring(duration: 0.25), value: speechRecognizer.isRecording)
                }

                Button(action: sendMessage) {
                    ZStack {
                        Circle()
                            .fill(viewModel.canSend ? SportsGPTPalette.lime : SportsGPTPalette.softPanel)
                            .frame(width: 50, height: 50)

                        Image(systemName: "arrow.up")
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(viewModel.canSend ? SportsGPTPalette.ink : SportsGPTPalette.mutedInk)
                    }
                }
                .disabled(!viewModel.canSend || viewModel.isLoading)
                .scaleEffect(viewModel.canSend && !viewModel.isLoading ? 1 : 0.96)
                .animation(.spring(duration: 0.25), value: viewModel.canSend)
            }
            .animation(.spring(duration: 0.25), value: viewModel.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(SportsGPTPalette.ink)
                    .overlay(
                        RoundedRectangle(cornerRadius: 26, style: .continuous)
                            .stroke(SportsGPTPalette.ink.opacity(0.15), lineWidth: 1)
                    )
            )
        }
    }

    private var backgroundGlow: some View {
        ZStack {
            Circle()
                .fill(SportsGPTPalette.lime.opacity(0.16))
                .frame(width: 220, height: 220)
                .blur(radius: 12)
                .offset(x: 120, y: -220)

            Circle()
                .fill(SportsGPTPalette.ink.opacity(0.08))
                .frame(width: 300, height: 300)
                .blur(radius: 20)
                .offset(x: -130, y: 280)
        }
        .allowsHitTesting(false)
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { viewModel.errorMessage != nil },
            set: { newValue in
                if !newValue {
                    viewModel.dismissError()
                }
            }
        )
    }

    private func sendMessage() {
        guard subscriptionStore.canSendNewRequest() else {
            subscriptionStore.presentPaywall(context: .requestLimitReached)
            return
        }

        isComposerFocused = false
        Task {
            let didSend = await viewModel.sendMessage()
            if didSend {
                subscriptionStore.recordSuccessfulRequest()
            }
        }
    }

    private var launchAwareOnboardingBinding: Binding<Bool> {
        Binding(
            get: { !isShowingLaunchScreen && hasSeenIntroExperience && !hasCompletedOnboarding },
            set: { _ in }
        )
    }

    private var introPresentationBinding: Binding<Bool> {
        Binding(
            get: { !isShowingLaunchScreen && !hasSeenIntroExperience && !hasCompletedOnboarding },
            set: { _ in }
        )
    }

    private func performInitialLoad() async {
        let loadStartedAt = Date()

        if viewModel.messages.isEmpty {
            viewModel.loadWelcomeState()
        }

        if viewModel.suggestedPrompts.isEmpty {
            async let suggestedPromptLoad: Void = viewModel.loadSuggestedPrompts()
            async let subscriptionRefresh: Void = subscriptionStore.refreshSubscriptionState()
            _ = await (suggestedPromptLoad, subscriptionRefresh)
        } else {
            await subscriptionStore.refreshSubscriptionState()
        }

        let elapsed = Date().timeIntervalSince(loadStartedAt)
        let minimumLaunchDuration = 0.85
        if elapsed < minimumLaunchDuration {
            try? await Task.sleep(for: .seconds(minimumLaunchDuration - elapsed))
        }

        await MainActor.run {
            withAnimation(.easeInOut(duration: 0.45)) {
                isShowingLaunchScreen = false
            }
        }

        guard hasCompletedOnboarding else { return }

        await focusComposerIfNeeded(after: .milliseconds(250))
    }

    private func sendSuggestedPrompt(_ prompt: SuggestedPrompt) async {
        guard subscriptionStore.canSendNewRequest() else {
            subscriptionStore.presentPaywall(context: .requestLimitReached)
            return
        }

        isComposerFocused = false
        let didSend = await viewModel.sendSuggestedPrompt(prompt)
        if didSend {
            subscriptionStore.recordSuccessfulRequest()
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let id = viewModel.messages.last?.id else { return }

        DispatchQueue.main.async {
            withAnimation(.spring(duration: 0.45)) {
                proxy.scrollTo(id, anchor: .bottom)
            }
        }
    }

    private func toggleRecording() {
        Task {
            do {
                if let transcript = try await speechRecognizer.toggleRecording(), !transcript.isEmpty {
                    if viewModel.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        viewModel.input = transcript
                    } else {
                        viewModel.input = viewModel.input.trimmingCharacters(in: .whitespacesAndNewlines) + " " + transcript
                    }
                    isComposerFocused = true
                } else if speechRecognizer.isRecording {
                    isComposerFocused = true
                }
            } catch {
                speechRecognizer.cancel()
                viewModel.errorMessage = (error as? LocalizedError)?.errorDescription ?? "Dictation could not start."
            }
        }
    }

    private func completeOnboarding() {
        let selectedSportsbooks = onboardingState.selectedSportsbooks
        let shouldApplySportsbooks = onboardingState.shouldApplySportsbooks

        if shouldApplySportsbooks {
            viewModel.selectedSportsbooks = selectedSportsbooks
        } else {
            viewModel.selectedSportsbooks.removeAll()
        }

        hasSeenIntroExperience = true
        hasCompletedOnboarding = true
        onboardingState = OnboardingState()

        Task {
            await viewModel.loadSuggestedPrompts()
            await subscriptionStore.refreshSubscriptionState()

            if subscriptionStore.isPremium {
                await focusComposerIfNeeded(after: .milliseconds(220))
            } else {
                try? await Task.sleep(for: .milliseconds(280))
                subscriptionStore.presentPaywall()
            }
        }
    }

    @MainActor
    private func focusComposerIfNeeded(after delay: Duration) async {
        guard !viewModel.hasAutoFocusedComposer else { return }
        viewModel.hasAutoFocusedComposer = true
        try? await Task.sleep(for: delay)
        isComposerFocused = true
    }
}

private struct RightSideMenu: View {
    @ObservedObject var subscriptionStore: SubscriptionStore
    @Binding var isPresented: Bool
    let onOpenLegal: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Account")
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.headerText)

                Spacer()

                Button {
                    withAnimation(.spring(duration: 0.3)) {
                        isPresented = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(SportsGPTPalette.headerText)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(Color.white.opacity(0.08))
                        )
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(subscriptionStore.state.statusTitle)
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.headerText)

                Text(subscriptionStore.state.statusDetail)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.headerText.opacity(0.78))
                    .lineSpacing(2)
            }

            VStack(alignment: .leading, spacing: 10) {
                Button {
                    isPresented = false
                    if subscriptionStore.isPremium {
                        subscriptionStore.presentAccountSettings()
                    } else {
                        subscriptionStore.presentPaywall()
                    }
                } label: {
                    HStack {
                        Text(subscriptionStore.state.ctaTitle)
                        Spacer()
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(SportsGPTPalette.lime)
                    )
                }

                Text("Account Settings")
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.headerText.opacity(0.56))
                    .textCase(.uppercase)

                Button {
                    isPresented = false
                    subscriptionStore.presentAccountSettings()
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Manage Account")
                                .font(.system(size: 14, weight: .black, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.headerText)

                            Text("\(subscriptionStore.state.planName) • \(subscriptionStore.state.billingStatus)")
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.headerText.opacity(0.72))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 8)

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(SportsGPTPalette.headerText.opacity(0.72))
                            .padding(.top, 2)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    )
                }

                Button {
                    isPresented = false
                    onOpenLegal()
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Terms & Privacy")
                                .font(.system(size: 14, weight: .black, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.headerText)

                            Text("Review legal terms, privacy disclosures, and responsible betting guidance.")
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.headerText.opacity(0.72))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 8)

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(SportsGPTPalette.headerText.opacity(0.72))
                            .padding(.top, 2)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    )
                }
            }

            if subscriptionStore.canManageAds {
                Button {
                    isPresented = false
                    subscriptionStore.presentAdPreferences()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Ad Preferences")
                                .font(.system(size: 14, weight: .black, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.headerText)

                            Text(subscriptionStore.areChatAdsEnabled ? "Chat ads are currently on." : "Chat ads are currently off.")
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.headerText.opacity(0.72))
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(SportsGPTPalette.headerText.opacity(0.72))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    )
                }
            }

        }
        .padding(18)
        .frame(width: 290, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(SportsGPTPalette.headerBar)
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        )
        .shadow(color: Color.black.opacity(0.18), radius: 22, y: 12)
    }
}

private struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var subscriptionStore: SubscriptionStore
    @State private var selectedPlanTitle = "Yearly"
    @State private var isDismissVisible = false
    @State private var presentedLegalDestination: PaywallLegalDestination?

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    heroCard

                    if shouldShowPlans {
                        planSection
                    }

                    benefitsSection
                    finePrintSection
                    paywallLinksSection
                }
                .padding(20)
                .padding(.bottom, 132)
            }
            .background(SportsGPTPalette.background.ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) {
                paywallBottomBar
            }
            .sheet(item: $presentedLegalDestination) { _ in
                LegalView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .alert("Subscription Issue", isPresented: subscriptionAlertBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(subscriptionStore.subscriptionErrorMessage ?? "Something went wrong.")
            }
            .task {
                await subscriptionStore.refreshSubscriptionState()
                guard !isDismissVisible else { return }
                try? await Task.sleep(for: .seconds(5))
                isDismissVisible = true
            }
        }
    }

    private var subscriptionAlertBinding: Binding<Bool> {
        Binding(
            get: { subscriptionStore.subscriptionErrorMessage != nil },
            set: { newValue in
                if !newValue {
                    subscriptionStore.clearSubscriptionError()
                }
            }
        )
    }

    private var selectedPlan: PaywallPlan {
        subscriptionStore.plans.first(where: { $0.title == selectedPlanTitle }) ?? subscriptionStore.plans[0]
    }

    private var shouldShowPlans: Bool {
        subscriptionStore.state == .neverSubscribed
    }

    private var heroHighlights: [String] {
        switch subscriptionStore.state {
        case .neverSubscribed:
            return [
                "Unlimited questions once you upgrade",
                "Cleaner chat without promo cards",
                "Sharper MoneyLine-backed market context"
            ]
        case .activeTrial:
            return [
                "Unlimited questions are already unlocked",
                "The ad-free experience is active",
                "You can manage billing details from your account"
            ]
        case .activeSubscriber:
            return [
                "Your premium access is already live",
                "Unlimited questions stay unlocked",
                "Premium settings live in Account Settings"
            ]
        }
    }

    private var paywallEyebrow: String {
        if subscriptionStore.paywallContext == .requestLimitReached {
            return "Free Limit Reached"
        }

        switch subscriptionStore.state {
        case .neverSubscribed:
            return "SportsGPT Pro"
        case .activeTrial:
            return "Trial Active"
        case .activeSubscriber:
            return "Pro Active"
        }
    }

    private var paywallTitle: String {
        if subscriptionStore.paywallContext == .requestLimitReached {
            return "You’ve used all 10 free asks"
        }

        switch subscriptionStore.state {
        case .neverSubscribed:
            return "Unlock SportsGPT Pro"
        case .activeTrial:
            return "Your Pro trial is active"
        case .activeSubscriber:
            return "You already have Pro"
        }
    }

    private var paywallDescription: String {
        if subscriptionStore.paywallContext == .requestLimitReached {
            return "You used your free starter access. Pick a plan to keep the chat open, remove the ad cards, and keep working through betting questions without the cap."
        }

        switch subscriptionStore.state {
        case .neverSubscribed:
            return "Go beyond the free starter experience with unlimited questions, cleaner chat, and the strongest version of the SportsGPT workflow."
        case .activeTrial:
            return "You already have premium access right now. Use this view to understand what Pro includes and manage what happens next."
        case .activeSubscriber:
            return "Your premium access is active. Keep using Pro and jump into Account Settings whenever you want to manage details."
        }
    }

    private var heroLeadingMetric: (label: String, value: String) {
        switch subscriptionStore.state {
        case .neverSubscribed:
            if subscriptionStore.paywallContext == .requestLimitReached {
                return ("Free asks used", "\(subscriptionStore.freeRequestLimit) / \(subscriptionStore.freeRequestLimit)")
            }
            return ("Free asks left", "\(subscriptionStore.remainingFreeRequests)")
        case .activeTrial:
            return (subscriptionStore.state.timingLabel, subscriptionStore.state.timingValue)
        case .activeSubscriber:
            return ("Status", "Pro active")
        }
    }

    private var heroTrailingMetric: (label: String, value: String) {
        switch subscriptionStore.state {
        case .neverSubscribed:
            return ("Selected plan", "\(selectedPlan.title) • \(selectedPlan.price)")
        case .activeTrial:
            return ("Plan", "Pro trial")
        case .activeSubscriber:
            return (subscriptionStore.state.timingLabel, subscriptionStore.state.timingValue)
        }
    }

    private var benefitsTitle: String {
        switch subscriptionStore.state {
        case .neverSubscribed:
            return "What Pro unlocks"
        case .activeTrial:
            return "What stays unlocked during your trial"
        case .activeSubscriber:
            return "Included with Pro"
        }
    }

    private var finePrint: String {
        switch subscriptionStore.state {
        case .neverSubscribed:
            if subscriptionStore.paywallContext == .requestLimitReached {
                return "\(selectedPlan.title) selected. \(selectedPlan.footnote) Premium removes the free cap right away."
            }
            return "\(selectedPlan.title) selected. \(selectedPlan.footnote)"
        case .activeTrial:
            return "Your trial keeps premium features available now. Use Account Settings to review timing and renewal details."
        case .activeSubscriber:
            return "Premium controls and billing details live in Account Settings."
        }
    }

    private var primaryButtonTitle: String {
        switch subscriptionStore.state {
        case .neverSubscribed:
            return subscriptionStore.paywallContext == .requestLimitReached ? "Unlock With \(selectedPlan.title)" : "Continue With \(selectedPlan.title)"
        case .activeTrial, .activeSubscriber:
            return "Open Account Settings"
        }
    }

    private var primaryButtonSupplement: String? {
        guard subscriptionStore.state == .neverSubscribed else {
            return nil
        }

        return "\(selectedPlan.title) • \(selectedPlan.price)"
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(paywallEyebrow)
                .font(.custom("Avenir Next", size: 12))
                .fontWeight(.semibold)
                .foregroundStyle(SportsGPTPalette.lime)
                .textCase(.uppercase)

            VStack(alignment: .leading, spacing: 10) {
                Text(paywallTitle)
                    .font(.custom("Avenir Next", size: 32))
                    .fontWeight(.semibold)
                    .foregroundStyle(SportsGPTPalette.card)
                    .fixedSize(horizontal: false, vertical: true)

                Text(paywallDescription)
                    .font(.custom("Avenir Next", size: 15))
                    .foregroundStyle(SportsGPTPalette.card.opacity(0.78))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 10) {
                ForEach(heroHighlights, id: \.self) { highlight in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(SportsGPTPalette.lime)
                            .padding(.top, 1)

                        Text(highlight)
                            .font(.custom("Avenir Next", size: 14))
                            .foregroundStyle(SportsGPTPalette.card.opacity(0.92))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            HStack(spacing: 12) {
                heroMetricCard(label: heroLeadingMetric.label, value: heroLeadingMetric.value)
                heroMetricCard(label: heroTrailingMetric.label, value: heroTrailingMetric.value)
            }
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(SportsGPTPalette.headerBar)
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(SportsGPTPalette.lime.opacity(0.28), lineWidth: 1)
                )
        )
    }

    private func heroMetricCard(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.custom("Avenir Next", size: 11))
                .fontWeight(.semibold)
                .foregroundStyle(SportsGPTPalette.card.opacity(0.62))
                .textCase(.uppercase)

            Text(value)
                .font(.custom("Avenir Next", size: 17))
                .fontWeight(.semibold)
                .foregroundStyle(SportsGPTPalette.card)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white.opacity(0.07))
        )
    }

    private var planSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Choose a plan")
                .font(.custom("Avenir Next", size: 22))
                .fontWeight(.semibold)
                .foregroundStyle(SportsGPTPalette.ink)

            Text("All premium plans remove the 10-question cap and keep the chat ad-free.")
                .font(.custom("Avenir Next", size: 14))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 12) {
                ForEach(subscriptionStore.plans) { plan in
                    Button {
                        selectedPlanTitle = plan.title
                    } label: {
                        HStack(alignment: .top, spacing: 14) {
                            ZStack {
                                Circle()
                                    .stroke(selectedPlanTitle == plan.title ? SportsGPTPalette.lime : SportsGPTPalette.border, lineWidth: 2)
                                    .frame(width: 22, height: 22)

                                if selectedPlanTitle == plan.title {
                                    Circle()
                                        .fill(SportsGPTPalette.lime)
                                        .frame(width: 10, height: 10)
                                }
                            }
                            .padding(.top, 2)

                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 8) {
                                    Text(plan.title)
                                        .font(.custom("Avenir Next", size: 18))
                                        .fontWeight(.semibold)
                                        .foregroundStyle(SportsGPTPalette.ink)

                                    if let badge = plan.badge {
                                        Text(badge)
                                            .font(.custom("Avenir Next", size: 11))
                                            .fontWeight(.semibold)
                                            .foregroundStyle(SportsGPTPalette.ink)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 5)
                                            .background(
                                                Capsule(style: .continuous)
                                                    .fill(SportsGPTPalette.lime.opacity(0.85))
                                            )
                                    }
                                }

                                Text(plan.detail)
                                    .font(.custom("Avenir Next", size: 14))
                                    .foregroundStyle(SportsGPTPalette.mutedInk)
                                    .fixedSize(horizontal: false, vertical: true)

                                Text(plan.footnote)
                                    .font(.custom("Avenir Next", size: 13))
                                    .fontWeight(.medium)
                                    .foregroundStyle(SportsGPTPalette.ink.opacity(0.72))
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            Spacer(minLength: 12)

                            VStack(alignment: .trailing, spacing: 4) {
                                Text(plan.price)
                                    .font(.custom("Avenir Next", size: 24))
                                    .fontWeight(.semibold)
                                    .foregroundStyle(SportsGPTPalette.ink)

                                Text(plan.cadence)
                                    .font(.custom("Avenir Next", size: 12))
                                    .fontWeight(.medium)
                                    .foregroundStyle(SportsGPTPalette.mutedInk)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        .padding(18)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(selectedPlanTitle == plan.title ? SportsGPTPalette.card : SportsGPTPalette.panel)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                                        .stroke(selectedPlanTitle == plan.title ? SportsGPTPalette.lime : SportsGPTPalette.border, lineWidth: selectedPlanTitle == plan.title ? 2 : 1)
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var benefitsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(benefitsTitle)
                .font(.custom("Avenir Next", size: 22))
                .fontWeight(.semibold)
                .foregroundStyle(SportsGPTPalette.ink)

            VStack(spacing: 0) {
                ForEach(Array(subscriptionStore.features.enumerated()), id: \.element.id) { index, feature in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: feature.symbol)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(SportsGPTPalette.ink)
                            .frame(width: 36, height: 36)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(SportsGPTPalette.lime.opacity(0.82))
                            )

                        VStack(alignment: .leading, spacing: 4) {
                            Text(feature.title)
                                .font(.custom("Avenir Next", size: 16))
                                .fontWeight(.semibold)
                                .foregroundStyle(SportsGPTPalette.ink)

                            Text(feature.detail)
                                .font(.custom("Avenir Next", size: 14))
                                .foregroundStyle(SportsGPTPalette.mutedInk)
                                .lineSpacing(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(16)

                    if index < subscriptionStore.features.count - 1 {
                        Divider()
                            .overlay(SportsGPTPalette.border)
                            .padding(.leading, 64)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(SportsGPTPalette.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(SportsGPTPalette.border, lineWidth: 1)
                    )
            )
        }
    }

    private var finePrintSection: some View {
        Text(finePrint)
            .font(.custom("Avenir Next", size: 12))
            .foregroundStyle(SportsGPTPalette.mutedInk)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var paywallLinksSection: some View {
        HStack(spacing: 18) {
            paywallLinkButton(title: "Terms") {
                presentedLegalDestination = .terms
            }

            paywallLinkButton(title: "Privacy") {
                presentedLegalDestination = .privacy
            }

            paywallLinkButton(title: "Restore") {
                Task {
                    let didRestore = await subscriptionStore.restorePurchases()
                    if didRestore {
                        closePaywall()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func paywallLinkButton(title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.custom("Avenir Next", size: 13))
            .fontWeight(.semibold)
            .foregroundStyle(SportsGPTPalette.mutedInk)
            .buttonStyle(.plain)
            .disabled(subscriptionStore.isSubscriptionOperationInProgress)
    }

    private var primaryActionButton: some View {
        Button {
            handlePrimaryAction()
        } label: {
            HStack(spacing: 12) {
                if subscriptionStore.isSubscriptionOperationInProgress {
                    ProgressView()
                        .tint(SportsGPTPalette.ink)
                }

                Text(subscriptionStore.isSubscriptionOperationInProgress ? "Working..." : primaryButtonTitle)
                    .font(.custom("Avenir Next", size: 16))
                    .fontWeight(.semibold)
                    .foregroundStyle(SportsGPTPalette.ink)

                Spacer()

                if let supplement = primaryButtonSupplement,
                   !subscriptionStore.isSubscriptionOperationInProgress {
                    Text(supplement)
                        .font(.custom("Avenir Next", size: 13))
                        .fontWeight(.semibold)
                        .foregroundStyle(SportsGPTPalette.card)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SportsGPTPalette.headerBar.opacity(0.88))
                        )
                } else {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SportsGPTPalette.ink)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(SportsGPTPalette.lime)
            )
        }
        .buttonStyle(.plain)
        .shadow(color: SportsGPTPalette.lime.opacity(0.28), radius: 20, y: 10)
        .shadow(color: Color.black.opacity(0.16), radius: 10, y: 4)
        .disabled(subscriptionStore.isSubscriptionOperationInProgress)
    }

    private var dismissButton: some View {
        Button("Not now") {
            closePaywall()
        }
        .font(.custom("Avenir Next", size: 15))
        .fontWeight(.medium)
        .foregroundStyle(SportsGPTPalette.mutedInk)
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
        .opacity(isDismissVisible ? 1 : 0)
        .animation(.easeInOut(duration: 3), value: isDismissVisible)
        .disabled(!isDismissVisible || subscriptionStore.isSubscriptionOperationInProgress)
    }

    private var paywallBottomBar: some View {
        VStack(spacing: 10) {
            primaryActionButton
            dismissButton
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .background(alignment: .top) {
            Rectangle()
                .fill(SportsGPTPalette.background)
                .ignoresSafeArea(edges: .bottom)
                .shadow(color: SportsGPTPalette.shadow.opacity(0.9), radius: 18, y: -8)
        }
    }

    private func handlePrimaryAction() {
        switch subscriptionStore.state {
        case .neverSubscribed:
            Task {
                let didUnlock = await subscriptionStore.purchase(plan: selectedPlan)
                if didUnlock {
                    closePaywall()
                }
            }
        case .activeTrial, .activeSubscriber:
            closePaywall()
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(250))
                subscriptionStore.presentAccountSettings()
            }
        }
    }

    private func closePaywall() {
        subscriptionStore.dismissPaywall()
        dismiss()
    }
}

private enum PaywallLegalDestination: String, Identifiable {
    case terms
    case privacy

    var id: String { rawValue }
}

private struct AdPreferencesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var subscriptionStore: SubscriptionStore

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Ad Preferences")
                        .font(.system(size: 28, weight: .black, design: .rounded))
                        .foregroundStyle(SportsGPTPalette.ink)

                    Text("As a paid subscriber, you can choose whether SportsGPT shows chat ad cards in your conversation.")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundStyle(SportsGPTPalette.mutedInk)
                        .lineSpacing(2)
                }

                Toggle(isOn: $subscriptionStore.areChatAdsEnabled) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Show Ads In Chat")
                            .font(.system(size: 16, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.ink)

                        Text("Turn off promotional ad cards that appear beneath assistant replies.")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)
                    }
                }
                .tint(SportsGPTPalette.lime)
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(SportsGPTPalette.card)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(SportsGPTPalette.border, lineWidth: 1)
                        )
                )

                Spacer()
            }
            .padding(20)
            .background(SportsGPTPalette.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        subscriptionStore.dismissAdPreferences()
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                }
            }
        }
    }
}

private struct AccountSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var subscriptionStore: SubscriptionStore

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Account Settings")
                            .font(.system(size: 30, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.ink)

                        Text("Manage your SportsGPT account, subscription, and premium controls from one place.")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)
                            .lineSpacing(2)
                    }

                    accountStatusCard
                    subscriptionSettingsCard
                    if subscriptionStore.canManageAds {
                        premiumSettingsCard
                    }
                }
                .padding(20)
            }
            .background(SportsGPTPalette.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        subscriptionStore.dismissAccountSettings()
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                }
            }
        }
    }

    private var accountStatusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Current Status")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .textCase(.uppercase)

                Spacer()

                Text(subscriptionStore.state.accountBadgeTitle)
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule(style: .continuous)
                            .fill(SportsGPTPalette.lime.opacity(0.82))
                    )
            }

            Text(subscriptionStore.state.statusTitle)
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)

            Text(subscriptionStore.state.statusDetail)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .lineSpacing(2)

            Text(subscriptionStore.state.accountSettingsDescription)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk.opacity(0.92))
                .lineSpacing(2)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }

    private var subscriptionSettingsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Subscription Settings")
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .textCase(.uppercase)

            settingsRow(title: "Plan", value: subscriptionStore.state.planName)
            settingsRow(title: "Billing", value: subscriptionStore.state.billingStatus)
            settingsRow(title: subscriptionStore.state.timingLabel, value: subscriptionStore.state.timingValue)
            settingsRow(title: "Subscription Access", value: subscriptionStore.state.managementNote)

            Button {
                switch subscriptionStore.state {
                case .neverSubscribed:
                    subscriptionStore.dismissAccountSettings()
                    dismiss()
                    subscriptionStore.presentPaywall()
                case .activeTrial, .activeSubscriber:
                    subscriptionStore.openManageSubscriptions()
                }
            } label: {
                HStack {
                    Text(subscriptionStore.accountActionTitle)
                    Spacer()
                    Image(systemName: "arrow.right")
                }
                .font(.system(size: 14, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(SportsGPTPalette.lime)
                )
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }

    private var premiumSettingsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Premium Controls")
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .textCase(.uppercase)

            Button {
                subscriptionStore.dismissAccountSettings()
                dismiss()
                subscriptionStore.presentAdPreferences()
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Ad Preferences")
                            .font(.system(size: 15, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.ink)

                        Text(subscriptionStore.areChatAdsEnabled ? "Chat ads are currently on." : "Chat ads are currently off.")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(SportsGPTPalette.mutedInk)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(SportsGPTPalette.panel)
                )
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }

    @ViewBuilder
    private func settingsRow(title: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(title)
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .frame(width: 108, alignment: .leading)

            Text(value)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
                .lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

}

private struct LegalView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Terms & Privacy")
                            .font(.system(size: 30, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.ink)

                        Text("Please review these terms, privacy disclosures, and responsible betting notices before using SportsGPT.")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)
                            .lineSpacing(2)
                    }

                    legalCard(title: "Terms of Service") {
                        legalParagraph("Effective date: April 8, 2026.")
                        legalParagraph("SportsGPT provides sports betting insights, AI summaries, and market context for informational purposes only. SportsGPT is not a sportsbook, does not accept wagers, does not guarantee outcomes, and should not be treated as financial, investment, or legal advice.")
                        legalParagraph("You must be 21+ and located in a jurisdiction where sports betting and related services are legal to use the app for betting-related research. You are solely responsible for complying with all local laws, platform rules, bookmaker requirements, and tax obligations.")
                        legalParagraph("Odds, expected value, best bets, arbitrage information, and other betting data may change quickly and may contain delays, errors, or omissions. SportsGPT, MoneyLine, and their providers are not responsible for losses, missed opportunities, or decisions you make based on app content.")
                        legalParagraph("Subscriptions, trials, renewals, billing, and entitlements will be managed through RevenueCat and the applicable app-store payment platform once those services are fully connected. Premium features may change over time.")
                    }

                    legalCard(title: "Privacy Policy") {
                        legalParagraph("SportsGPT may process prompts, chat history, selected sportsbook preferences, subscription state, and basic app interaction data to operate the product and improve the user experience. If you use dictation, speech recognition permissions are handled through Apple frameworks on your device.")
                        legalParagraph("We use third-party service providers to power parts of the app. MoneyLineApp.com provides betting-related data and AI context used in SportsGPT responses. RevenueCat provides subscription, entitlement, and purchase infrastructure when billing is enabled.")
                        legalParagraph("Information may be shared with these providers only as needed to deliver their services, including request contents, subscription state, purchase information, and technical identifiers required for platform functionality. You should also review each provider’s own terms and privacy materials.")
                        legalLinks
                    }

                    legalCard(title: "Responsible Betting") {
                        legalParagraph("Bet responsibly. Never wager more than you can afford to lose, and do not treat betting promotions or model outputs as guaranteed profit.")
                        legalParagraph("Must be 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER. Additional state-specific resources may apply depending on where you are located.")
                    }

                    legalCard(title: "Third-Party Providers") {
                        legalParagraph("MoneyLineApp.com is a third-party provider used for sports betting data and AI-grounded betting context. RevenueCat is a third-party provider used for subscription infrastructure and entitlement management.")
                        legalParagraph("Their products, policies, uptime, and data handling practices are outside SportsGPT’s direct control.")
                    }

                    Text("This screen is a product-level legal disclosure and UX implementation, not law-firm-reviewed legal advice. You should have final terms and privacy language reviewed by your attorney before production launch.")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(SportsGPTPalette.mutedInk)
                        .lineSpacing(2)
                }
                .padding(20)
            }
            .background(SportsGPTPalette.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                }
            }
        }
    }

    private func legalCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .textCase(.uppercase)

            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }

    private func legalParagraph(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium, design: .rounded))
            .foregroundStyle(SportsGPTPalette.ink)
            .lineSpacing(2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var legalLinks: some View {
        VStack(alignment: .leading, spacing: 10) {
            Link("MoneyLine Terms", destination: URL(string: "https://www.moneylineapp.com/terms")!)
                .font(.system(size: 14, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)

            Link("MoneyLine Privacy", destination: URL(string: "https://www.moneylineapp.com/privacy")!)
                .font(.system(size: 14, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)

            Link("RevenueCat Privacy Resources", destination: URL(string: "https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy")!)
                .font(.system(size: 14, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
        }
    }
}

private struct ChatBubble: View {
    let message: ChatMessage
    let shouldShowAd: Bool

    var body: some View {
        VStack(alignment: message.isUser ? .trailing : .leading, spacing: 8) {
            Text(message.isUser ? "You" : "SportsGPT")
                .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)

            VStack(alignment: .leading, spacing: 12) {
                if let presentation = message.assistantPresentation, !message.isUser {
                    AssistantPresentationView(presentation: presentation)
                } else {
                    MessageMarkdownText(text: message.text)
                }

                if !message.isUser && message.includeInAPIRequest && shouldShowAd {
                    PromotionCardView()
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bubbleBackground)
        }
        .frame(maxWidth: .infinity, alignment: message.isUser ? .trailing : .leading)
    }

    private var bubbleBackground: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(message.isUser ? SportsGPTPalette.userBubble : SportsGPTPalette.card)
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(message.isUser ? SportsGPTPalette.userBorder : SportsGPTPalette.border, lineWidth: 1)
            )
    }
}

private struct ThinkingBubble: View {
    let text: String
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(index == 1 ? SportsGPTPalette.lime : SportsGPTPalette.ink.opacity(0.28))
                        .frame(width: 8, height: 8)
                        .scaleEffect(pulse ? 1.0 : 0.72)
                        .animation(
                            .easeInOut(duration: 0.55)
                            .repeatForever()
                            .delay(Double(index) * 0.12),
                            value: pulse
                        )
                }
            }

            Text(text)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)

            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
        .onAppear {
            pulse = true
        }
    }
}

private struct IntroLandingView: View {
    let onContinue: () -> Void

    @State private var currentPage = 0

    private let slides: [IntroSlide] = [
        .init(
            eyebrow: "Step 1",
            title: "Ask the question you already have in your head.",
            detail: "Type a game, team, player, or market question the same way you would ask a smart betting friend."
        ),
        .init(
            eyebrow: "Step 2",
            title: "Get one clean best-bet answer back.",
            detail: "SportsGPT turns live market data into a readable recommendation with the best book, price, and reason."
        ),
        .init(
            eyebrow: "Step 3",
            title: "Behind the scenes, SportsGPT does the math for you.",
            detail: "It is wired into real-time books, edge calculations, and live pricing so every answer starts with current market context."
        )
    ]

    var body: some View {
        ZStack {
            SportsGPTPalette.background
                .ignoresSafeArea()

            VStack(spacing: 24) {
                HStack {
                    Text("SportsGPT")
                        .font(.custom("Avenir Next", size: 24))
                        .fontWeight(.medium)
                        .foregroundStyle(SportsGPTPalette.ink)

                    Spacer()
                }

                TabView(selection: $currentPage) {
                    introSlideCard(for: 0)
                        .tag(0)

                    introSlideCard(for: 1)
                        .tag(1)

                    introSlideCard(for: 2)
                        .tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                HStack(spacing: 8) {
                    ForEach(slides.indices, id: \.self) { index in
                        Capsule(style: .continuous)
                            .fill(index == currentPage ? SportsGPTPalette.lime : SportsGPTPalette.softPanel)
                            .frame(width: index == currentPage ? 30 : 12, height: 8)
                    }
                }
                .animation(.spring(duration: 0.28), value: currentPage)

                Button {
                    if currentPage < slides.count - 1 {
                        withAnimation(.spring(duration: 0.28)) {
                            currentPage += 1
                        }
                    } else {
                        onContinue()
                    }
                } label: {
                    HStack {
                        Text(currentPage == slides.count - 1 ? "Start Setup" : "Continue")

                        Spacer()

                        Image(systemName: "arrow.right")
                    }
                    .font(.custom("Avenir Next", size: 16))
                    .fontWeight(.semibold)
                    .foregroundStyle(SportsGPTPalette.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(SportsGPTPalette.lime)
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 22)
            .padding(.top, 22)
            .padding(.bottom, 28)
        }
    }

    @ViewBuilder
    private func introSlideCard(for index: Int) -> some View {
        let slide = slides[index]

        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 10) {
                Text(slide.eyebrow)
                    .font(.custom("Avenir Next", size: 12))
                    .fontWeight(.heavy)
                    .tracking(0.8)
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .textCase(.uppercase)

                Text(slide.title)
                    .font(.custom("Avenir Next", size: 30))
                    .fontWeight(.bold)
                    .foregroundStyle(SportsGPTPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)

                Text(slide.detail)
                    .font(.custom("Avenir Next", size: 16))
                    .fontWeight(.medium)
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            slideVisual(for: index)

            Spacer(minLength: 0)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 32, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
                .shadow(color: SportsGPTPalette.shadow, radius: 18, y: 12)
        )
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func slideVisual(for index: Int) -> some View {
        switch index {
        case 0:
            VStack(alignment: .leading, spacing: 12) {
                Text("You")
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)

                Text("What’s the best bet for the Cowboys game tonight?")
                    .font(.custom("Avenir Next", size: 21))
                    .fontWeight(.semibold)
                    .foregroundStyle(SportsGPTPalette.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 26, style: .continuous)
                            .fill(SportsGPTPalette.userBubble)
                            .overlay(
                                RoundedRectangle(cornerRadius: 26, style: .continuous)
                                    .stroke(SportsGPTPalette.userBorder, lineWidth: 1)
                            )
                    )
            }

        case 1:
            VStack(alignment: .leading, spacing: 14) {
                Text("SportsGPT")
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Best Bet")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .foregroundStyle(SportsGPTPalette.mutedInk)
                        .textCase(.uppercase)

                    Text("Dallas Cowboys Moneyline")
                        .font(.custom("Avenir Next", size: 24))
                        .fontWeight(.semibold)
                        .foregroundStyle(SportsGPTPalette.ink)

                    Text("Cowboys vs. Eagles")
                        .font(.custom("Avenir Next", size: 15))
                        .foregroundStyle(SportsGPTPalette.mutedInk)

                    Text("+118")
                        .font(.custom("Avenir Next", size: 15))
                        .fontWeight(.semibold)
                        .foregroundStyle(SportsGPTPalette.mutedInk)

                    HStack(spacing: 8) {
                        introFactPill(label: "Sportsbook", value: "DraftKings")
                        introFactPill(label: "Why", value: "Best price")
                    }

                    Text("SportsGPT found the strongest number still on the board and explained why it stands out.")
                        .font(.custom("Avenir Next", size: 14))
                        .foregroundStyle(SportsGPTPalette.mutedInk)
                        .lineSpacing(2)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(SportsGPTPalette.panel)
                        .overlay(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(SportsGPTPalette.lime.opacity(0.45), lineWidth: 1)
                        )
                )
            }

        default:
            VStack(alignment: .leading, spacing: 12) {
                introProcessRow(number: "1", title: "Live books", detail: "SportsGPT checks current prices across books and exchanges.")
                introProcessRow(number: "2", title: "Edge math", detail: "It weighs EV, market context, and where the best number actually lives.")
                introProcessRow(number: "3", title: "Clean answer", detail: "You get one readable recommendation instead of raw sportsbook clutter.")
            }
        }
    }

    private func introFactPill(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)

            Text(value)
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            Capsule(style: .continuous)
                .fill(SportsGPTPalette.softPanel)
        )
    }

    private func introProcessRow(number: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text(number)
                .font(.custom("Avenir Next", size: 18))
                .fontWeight(.bold)
                .foregroundStyle(SportsGPTPalette.ink)
                .frame(width: 38, height: 38)
                .background(
                    Circle()
                        .fill(SportsGPTPalette.lime)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.custom("Avenir Next", size: 18))
                    .fontWeight(.semibold)
                    .foregroundStyle(SportsGPTPalette.ink)

                Text(detail)
                    .font(.custom("Avenir Next", size: 14))
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .lineSpacing(2)
            }

            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SportsGPTPalette.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }
}

private struct IntroSlide {
    let eyebrow: String
    let title: String
    let detail: String
}

private struct SportsGPTLaunchScreen: View {
    var body: some View {
        ZStack {
            SportsGPTPalette.background
                .ignoresSafeArea()

            VStack(spacing: 18) {
                Text("SportsGPT")
                    .font(.custom("Avenir Next", size: 34))
                    .fontWeight(.medium)
                    .tracking(0.2)
                    .foregroundStyle(SportsGPTPalette.ink)

                ProgressView()
                    .tint(SportsGPTPalette.ink.opacity(0.72))
                    .scaleEffect(0.95)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }
}

private struct RecordCardView: View {
    let card: DisplayRecordCard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title = card.title {
                Text(title)
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
            }

            if let subtitle = card.subtitle {
                Text(subtitle)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)
            }

            if !card.keyFacts.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), alignment: .leading)], alignment: .leading, spacing: 8) {
                    ForEach(card.keyFacts) { fact in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(fact.label)
                                .font(.system(size: 10, weight: .black, design: .rounded))
                            Text(fact.value)
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                        }
                        .foregroundStyle(foregroundColor(for: fact.style))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(
                            Capsule(style: .continuous)
                                .fill(backgroundColor(for: fact.style))
                        )
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(borderColor(for: fact.style), lineWidth: fact.style == .neutral ? 1 : 0)
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }

            if !card.details.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(card.details) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Text(item.label)
                                .font(.system(size: 12, weight: .black, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.mutedInk)
                                .frame(width: 92, alignment: .leading)

                            Text(item.value)
                                .font(.system(size: 12, weight: item.label == "Pick" ? .bold : .medium, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(SportsGPTPalette.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }

    private func backgroundColor(for style: DisplayRecordCard.FactStyle) -> Color {
        switch style {
        case .accent:
            return SportsGPTPalette.lime.opacity(0.82)
        case .secondary:
            return SportsGPTPalette.softPanel
        case .book:
            return SportsGPTPalette.headerBar.opacity(0.92)
        case .neutral:
            return SportsGPTPalette.panel
        }
    }

    private func foregroundColor(for style: DisplayRecordCard.FactStyle) -> Color {
        switch style {
        case .book:
            return SportsGPTPalette.headerText
        default:
            return SportsGPTPalette.ink
        }
    }

    private func borderColor(for style: DisplayRecordCard.FactStyle) -> Color {
        switch style {
        case .neutral:
            return SportsGPTPalette.border
        default:
            return .clear
        }
    }
}

private struct MessageMarkdownText: View {
    let text: String

    var body: some View {
        if let markdown = try? AttributedString(markdown: text) {
            Text(markdown)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
                .lineSpacing(3)
                .textSelection(.enabled)
        } else {
            Text(text)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
                .lineSpacing(3)
                .textSelection(.enabled)
        }
    }
}

private struct AssistantPresentationView: View {
    let presentation: AssistantPresentation
    @State private var selectedMetricInfo: MetricInfoSheetState?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let sourceLabel = presentation.sourceLabel ?? presentation.entityMatchup {
                Text(sourceLabel)
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .textCase(.uppercase)
            }

            if let headline = presentation.headline {
                RichTextBlock(
                    text: headline,
                    font: .custom("Avenir Next", size: 22),
                    color: SportsGPTPalette.ink,
                    lineSpacing: 2
                )
            }

            if let summary = presentation.summary {
                RichTextBlock(
                    text: summary,
                    font: .system(size: 15, weight: .medium, design: .rounded),
                    color: SportsGPTPalette.ink,
                    lineSpacing: 3
                )
            }

            if let primaryPick = presentation.primaryPick {
                RecommendationBlockView(
                    eyebrow: "Best Bet",
                    recommendation: primaryPick,
                    isPrimary: true,
                    onMetricTap: { selectedMetricInfo = $0 }
                )
            }

            if let alternativePick = presentation.alternativePick {
                RecommendationBlockView(
                    eyebrow: "Alternative",
                    recommendation: alternativePick,
                    isPrimary: false,
                    onMetricTap: { selectedMetricInfo = $0 }
                )
            }

            if !presentation.cards.isEmpty || presentation.expandedExplanation != nil {
                Text("Supporting Data")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .textCase(.uppercase)
            }

            if let expandedExplanation = presentation.expandedExplanation {
                RichTextBlock(
                    text: expandedExplanation,
                    font: .system(size: 14, weight: .medium, design: .rounded),
                    color: SportsGPTPalette.ink,
                    lineSpacing: 3
                )
            }
        }
        .textSelection(.enabled)
        .sheet(item: $selectedMetricInfo) { metricInfo in
            MetricInfoSheet(metricInfo: metricInfo)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }
}

private struct RecommendationBlockView: View {
    let eyebrow: String
    let recommendation: AssistantPresentation.Recommendation
    let isPrimary: Bool
    let onMetricTap: (MetricInfoSheetState) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow)
                .font(.system(size: 11, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .textCase(.uppercase)

            RichTextBlock(
                text: displayTitle,
                font: .custom("Avenir Next", size: isPrimary ? 20 : 17),
                color: SportsGPTPalette.ink,
                lineSpacing: 2
            )

            if let contextLabel = recommendation.contextLabel {
                RichTextBlock(
                    text: contextLabel,
                    font: .system(size: 13, weight: .medium, design: .rounded),
                    color: SportsGPTPalette.mutedInk,
                    lineSpacing: 2
                )
            }

            if let startTimeLine = startTimeLine {
                RichTextBlock(
                    text: startTimeLine,
                    font: .system(size: 13, weight: .medium, design: .rounded),
                    color: SportsGPTPalette.mutedInk,
                    lineSpacing: 2
                )
            }

            if let marketOddsLine = marketOddsLine {
                RichTextBlock(
                    text: marketOddsLine,
                    font: .system(size: 13, weight: .semibold, design: .rounded),
                    color: SportsGPTPalette.mutedInk,
                    lineSpacing: 2
                )
            }

            if !recommendation.facts.isEmpty {
                FlexibleFactWrap(
                    facts: recommendation.facts,
                    onMetricTap: onMetricTap
                )
            }

            if let rationale = recommendation.rationale {
                RichTextBlock(
                    text: rationale,
                    font: .system(size: 13, weight: .medium, design: .rounded),
                    color: SportsGPTPalette.mutedInk,
                    lineSpacing: 2
                )
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(isPrimary ? SportsGPTPalette.panel : SportsGPTPalette.card.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(isPrimary ? SportsGPTPalette.lime.opacity(0.45) : SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }

    private var displayTitle: String {
        let selection = recommendation.selection.trimmed
        guard let marketLabel = recommendation.marketLabel?.trimmed.nilIfEmpty else {
            return selection
        }
        guard !selection.caseInsensitiveTrimmed.localizedCaseInsensitiveContains(marketLabel.caseInsensitiveTrimmed) else {
            return selection
        }
        return "\(selection) \(marketLabel)".cleanSentenceSpacing.trimmed
    }

    private var startTimeLine: String? {
        recommendation.eventStartTime?.sportsbookEasternTimeText
    }

    private var marketOddsLine: String? {
        switch recommendation.oddsDisplay?.trimmed.nilIfEmpty {
        case let odds?:
            return odds
        case nil:
            return nil
        }
    }
}

private struct RichTextBlock: View {
    private struct LineFragment: Identifiable {
        let id = UUID()
        let kind: Kind

        enum Kind {
            case paragraph(Text)
            case bullet(Text)
            case spacer
        }
    }

    let text: String
    let font: Font
    let color: Color
    let lineSpacing: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: lineSpacing + 4) {
            ForEach(parsedLines) { fragment in
                switch fragment.kind {
                case .paragraph(let text):
                    text
                        .font(font)
                        .foregroundStyle(color)
                        .fixedSize(horizontal: false, vertical: true)
                case .bullet(let text):
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .font(font)
                            .foregroundStyle(color)

                        text
                            .font(font)
                            .foregroundStyle(color)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                case .spacer:
                    Color.clear
                        .frame(height: max(6, lineSpacing + 2))
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var parsedLines: [LineFragment] {
        text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
            .map { line -> LineFragment in
                let trimmedLine = line.trimmingCharacters(in: .whitespaces)

                if trimmedLine.isEmpty {
                    return LineFragment(kind: .spacer)
                }

                if trimmedLine.hasPrefix("- ") {
                    let content = String(trimmedLine.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                    return LineFragment(kind: .bullet(styledText(from: content)))
                }

                return LineFragment(kind: .paragraph(styledText(from: trimmedLine)))
            }
    }

    private func styledText(from raw: String) -> Text {
        let normalized = raw.replacingOccurrences(of: "\\*\\*", with: "**", options: .regularExpression)
        let components = normalized.components(separatedBy: "**")

        guard components.count > 1 else {
            return Text(normalized)
        }

        return components.enumerated().reduce(Text("")) { partial, pair in
            let (index, component) = pair
            guard !component.isEmpty else { return partial }

            let segment: Text
            if index.isMultiple(of: 2) {
                segment = Text(component)
            } else {
                segment = Text(component).bold()
            }

            return Text("\(partial)\(segment)")
        }
    }
}

private struct FlexibleFactWrap: View {
    let facts: [AssistantPresentation.Fact]
    let onMetricTap: (MetricInfoSheetState) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(chunkedFacts, id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { fact in
                        FactPill(
                            fact: fact,
                            allFacts: facts,
                            onMetricTap: onMetricTap
                        )
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var chunkedFacts: [[AssistantPresentation.Fact]] {
        stride(from: 0, to: facts.count, by: 2).map { start in
            Array(facts[start..<min(start + 2, facts.count)])
        }
    }
}

private struct FactPill: View {
    let fact: AssistantPresentation.Fact
    let allFacts: [AssistantPresentation.Fact]
    let onMetricTap: (MetricInfoSheetState) -> Void

    var body: some View {
        Group {
            if let metricInfo = MetricInfoSheetState(fact: fact, allFacts: allFacts) {
                Button {
                    onMetricTap(metricInfo)
                } label: {
                    pillContent(isInteractive: true)
                }
                .buttonStyle(.plain)
            } else {
                pillContent(isInteractive: false)
            }
        }
    }

    private var backgroundColor: Color {
        switch fact.label.lowercased() {
        case "edge", "ev", "profit":
            return SportsGPTPalette.lime.opacity(0.88)
        case "implied", "model":
            return SportsGPTPalette.card.opacity(0.82)
        case "odds":
            return Color.black.opacity(0.08)
        case "book", "books":
            return Color.white.opacity(0.5)
        default:
            return SportsGPTPalette.softPanel
        }
    }

    private var foregroundColor: Color {
        switch fact.label.lowercased() {
        case "odds":
            return SportsGPTPalette.ink
        default:
            return SportsGPTPalette.ink
        }
    }

    @ViewBuilder
    private func pillContent(isInteractive: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fact.label)
                    .font(.system(size: 10, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)

                Text(fact.value)
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .foregroundStyle(foregroundColor)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isInteractive {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(SportsGPTPalette.ink.opacity(0.72))
                    .padding(.top, 1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            Capsule(style: .continuous)
                .fill(backgroundColor)
        )
        .overlay(
            Capsule(style: .continuous)
                .stroke(isInteractive ? SportsGPTPalette.ink.opacity(0.08) : .clear, lineWidth: 1)
        )
    }
}

private struct MetricInfoSheetState: Identifiable {
    let kind: MetricExplainerKind
    let value: String
    let relatedValues: [String: String]

    var id: String {
        "\(kind.rawValue)|\(value)|\(relatedValues["implied"] ?? "")|\(relatedValues["model"] ?? "")"
    }

    init?(fact: AssistantPresentation.Fact, allFacts: [AssistantPresentation.Fact]) {
        guard let kind = MetricExplainerKind(label: fact.label) else { return nil }
        self.kind = kind
        self.value = fact.value
        self.relatedValues = Dictionary(
            uniqueKeysWithValues: allFacts.compactMap { item in
                guard let normalized = MetricExplainerKind(label: item.label)?.rawValue else { return nil }
                return (normalized, item.value)
            }
        )
    }

    var numericValue: Double? {
        value.numericSubstring
    }

    var edgeValue: String? {
        relatedValues[MetricExplainerKind.edge.rawValue]
    }

    var evValue: String? {
        relatedValues[MetricExplainerKind.ev.rawValue]
    }

    var impliedValue: String? {
        relatedValues[MetricExplainerKind.implied.rawValue]
    }

    var modelValue: String? {
        relatedValues[MetricExplainerKind.model.rawValue]
    }
}

private enum MetricExplainerKind: String {
    case edge
    case ev
    case implied
    case model

    init?(label: String) {
        switch label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "edge":
            self = .edge
        case "ev":
            self = .ev
        case "implied":
            self = .implied
        case "model":
            self = .model
        default:
            return nil
        }
    }

    var badgeTitle: String {
        switch self {
        case .edge:
            return "Market edge"
        case .ev:
            return "Long-run value"
        case .implied:
            return "Book's number"
        case .model:
            return "SportsGPT number"
        }
    }

    var title: String {
        switch self {
        case .edge:
            return "Edge"
        case .ev:
            return "Expected Value"
        case .implied:
            return "Implied Win Chance"
        case .model:
            return "Model Win Chance"
        }
    }

    var iconName: String {
        switch self {
        case .edge:
            return "scope"
        case .ev:
            return "chart.line.uptrend.xyaxis"
        case .implied:
            return "building.columns.fill"
        case .model:
            return "sparkles"
        }
    }

    var accentColor: Color {
        switch self {
        case .edge, .ev:
            return SportsGPTPalette.lime
        case .implied:
            return SportsGPTPalette.softPanel
        case .model:
            return SportsGPTPalette.headerBar
        }
    }

    func headline(for metric: MetricInfoSheetState) -> String {
        switch self {
        case .edge:
            let value = metric.numericValue ?? 0
            if value >= 5 {
                return "This price is standing out from the market in a real way."
            } else if value > 0 {
                return "This line has a real edge, even if it is not a monster gap."
            } else {
                return "This line is pretty close to the market."
            }
        case .ev:
            let value = metric.numericValue ?? 0
            if value >= 8 {
                return "This is the kind of long-run value bettors stop and read twice."
            } else if value > 0 {
                return "This is a positive-value bet, which is exactly what you want to see."
            } else {
                return "This price is not showing much long-run upside."
            }
        case .implied:
            return "This is the sportsbook's built-in guess about the bet."
        case .model:
            return "This is SportsGPT's own estimate for how often the bet should hit."
        }
    }

    func plainEnglish(for metric: MetricInfoSheetState) -> String {
        switch self {
        case .edge:
            return "\(metric.value) means this line looks better than the broader market by about that amount. Bigger positive edge usually means the price is more interesting."
        case .ev:
            return "\(metric.value) is the estimated long-run upside on this price. If you could replay this same kind of bet over and over, positive EV is what you would want."
        case .implied:
            if let model = metric.modelValue {
                return "\(metric.value) is the book's number. If SportsGPT's model is higher than that \(model), the price may be giving you extra room."
            }
            return "\(metric.value) is the book's number. Think of it as the sportsbook's side of the argument."
        case .model:
            if let implied = metric.impliedValue {
                return "\(metric.value) is SportsGPT's estimate. If it is higher than the book's implied number \(implied), that can point to value."
            }
            return "\(metric.value) is SportsGPT's estimate for how often this bet should win."
        }
    }

    func whyItMatters(for metric: MetricInfoSheetState) -> String {
        switch self {
        case .edge:
            return "Positive edge is one of the clearest signs that a line is worth a second look. It does not promise a win tonight, but it tells you the number may be too generous."
        case .ev:
            return "EV is the fastest way to ask, “Is this price good for me over time?” Positive EV is usually the first green light serious bettors want."
        case .implied:
            return "This helps you see what the book is charging you for. It is useful because every value conversation starts with the sportsbook's price."
        case .model:
            return "This is the app's own view of the bet. When this runs above the book's implied number, that gap is often where value starts to show up."
        }
    }

    func quickRead(for metric: MetricInfoSheetState) -> String {
        switch self {
        case .edge:
            return "Quick read: positive is good, bigger is better, and anything above zero is at least worth checking."
        case .ev:
            return "Quick read: positive EV means the price is working in your favor over time."
        case .implied:
            return "Quick read: lower implied number means a longer shot, higher implied number means the book sees it as more likely."
        case .model:
            return "Quick read: if the model number beats the implied number, SportsGPT likes the bet more than the book does."
        }
    }
}

private struct MetricInfoSheet: View {
    @Environment(\.dismiss) private var dismiss
    let metricInfo: MetricInfoSheetState

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    heroCard

                    if !comparisonRows.isEmpty {
                        comparisonSection
                    }

                    explanationCard(
                        title: "In plain English",
                        text: metricInfo.kind.plainEnglish(for: metricInfo)
                    )

                    explanationCard(
                        title: "Why bettors care",
                        text: metricInfo.kind.whyItMatters(for: metricInfo)
                    )

                    explanationCard(
                        title: "Quick read",
                        text: metricInfo.kind.quickRead(for: metricInfo)
                    )
                }
                .padding(20)
            }
            .background(SportsGPTPalette.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                }
            }
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(metricInfo.kind.accentColor.opacity(metricInfo.kind == .model ? 1 : 0.9))
                            .frame(width: 44, height: 44)

                        Image(systemName: metricInfo.kind.iconName)
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(metricInfo.kind == .model ? SportsGPTPalette.card : SportsGPTPalette.ink)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(metricInfo.kind.badgeTitle)
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)
                            .textCase(.uppercase)

                        Text(metricInfo.kind.title)
                            .font(.custom("Avenir Next", size: 24))
                            .fontWeight(.semibold)
                            .foregroundStyle(SportsGPTPalette.ink)
                    }
                }

                Spacer()

                Text(metricInfo.value)
                    .font(.custom("Avenir Next", size: 26))
                    .fontWeight(.semibold)
                    .foregroundStyle(SportsGPTPalette.ink)
            }

            Text(metricInfo.kind.headline(for: metricInfo))
                .font(.custom("Avenir Next", size: 16))
                .fontWeight(.medium)
                .foregroundStyle(SportsGPTPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(2)
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(metricInfo.kind.accentColor.opacity(0.45), lineWidth: 1)
                )
        )
    }

    private var comparisonRows: [(String, String)] {
        switch metricInfo.kind {
        case .edge, .ev:
            return [
                metricInfo.impliedValue.map { ("Book's number", $0) },
                metricInfo.modelValue.map { ("SportsGPT number", $0) }
            ]
            .compactMap { $0 }
        case .implied:
            return [
                ("Book's number", metricInfo.value),
                metricInfo.modelValue.map { ("SportsGPT number", $0) }
            ]
            .compactMap { $0 }
        case .model:
            return [
                metricInfo.impliedValue.map { ("Book's number", $0) },
                ("SportsGPT number", metricInfo.value)
            ]
            .compactMap { $0 }
        }
    }

    private var comparisonSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Compare the two views")
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .textCase(.uppercase)

            HStack(spacing: 10) {
                ForEach(comparisonRows, id: \.0) { row in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(row.0)
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)

                        Text(row.1)
                            .font(.custom("Avenir Next", size: 20))
                            .fontWeight(.semibold)
                            .foregroundStyle(SportsGPTPalette.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(SportsGPTPalette.panel)
                    )
                }
            }
        }
    }

    private func explanationCard(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .textCase(.uppercase)

            Text(text)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }
}

private struct PromotionCardView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recommended Place To Bet")
                .font(.system(size: 11, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)

            Text("Rebet")
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)

            Text("Current promotion: 100% bonus on deposit up to $100.")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)

            Text("With a promotion like this, even if you lose, you win. If you deposit $50, that extra bonus meaningfully cushions the downside and gives you more room to work with.")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
                .lineSpacing(2)

            Link(destination: URL(string: "https://mlapi.bet/track/rebet?source=d63ef966-3e38-45f3-8e3e-aff7b9f0e65d")!) {
                HStack(spacing: 8) {
                    Text("Open Rebet")
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .bold))
                }
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundStyle(SportsGPTPalette.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    Capsule(style: .continuous)
                        .fill(SportsGPTPalette.lime)
                )
            }

            Text("Must be 21+ and use 1-800-GAMBLER.")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(SportsGPTPalette.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
        )
    }
}

private struct SuggestedPromptsRow: View {
    let prompts: [SuggestedPrompt]
    let onSelect: (SuggestedPrompt) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Suggested")
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(prompts) { prompt in
                        Button {
                            onSelect(prompt)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(prompt.shortLabel)
                                    .font(.system(size: 13, weight: .black, design: .rounded))
                                    .foregroundStyle(SportsGPTPalette.ink)

                                Text(prompt.text)
                                    .font(.system(size: 12, weight: .medium, design: .rounded))
                                    .foregroundStyle(SportsGPTPalette.mutedInk)
                                    .lineLimit(3)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .frame(width: 196, height: 92, alignment: .topLeading)
                            .background(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .fill(SportsGPTPalette.panel)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                                            .stroke(SportsGPTPalette.border, lineWidth: 1)
                                    )
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }
}

private struct SuggestedPromptsLoadingRow: View {
    @State private var shimmerOffset: CGFloat = -220

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Suggested")
                .font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundStyle(SportsGPTPalette.mutedInk)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(SportsGPTPalette.panel)
                            .frame(width: 196, height: 84)
                            .overlay(alignment: .leading) {
                                VStack(alignment: .leading, spacing: 8) {
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(Color.white.opacity(0.34))
                                        .frame(width: 72, height: 12)

                                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                                        .fill(Color.white.opacity(0.28))
                                        .frame(width: 148, height: 12)

                                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                                        .fill(Color.white.opacity(0.22))
                                        .frame(width: 126, height: 12)
                                }
                                .padding(.horizontal, 14)
                            }
                            .overlay {
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [
                                                Color.white.opacity(0),
                                                Color.white.opacity(0.24),
                                                Color.white.opacity(0)
                                            ],
                                            startPoint: .top,
                                            endPoint: .bottom
                                        )
                                    )
                                    .rotationEffect(.degrees(18))
                                    .offset(x: shimmerOffset)
                                    .blendMode(.plusLighter)
                                    .mask(
                                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    )
                            }
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 1.15).repeatForever(autoreverses: false)) {
                shimmerOffset = 220
            }
        }
    }
}

private struct SportsbookFilterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedSportsbooks: Set<Sportsbook>
    @State private var searchText = ""

    private var filteredSportsbooks: [Sportsbook] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return Sportsbook.all }

        return Sportsbook.all.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Sportsbooks")
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.ink)

                        Text("Filter SportsGPT down to the books you actually use.")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundStyle(SportsGPTPalette.mutedInk)
                    }

                    HStack(spacing: 10) {
                        Button("All Books") {
                            selectedSportsbooks.removeAll()
                        }
                        .buttonStyle(FilterActionButtonStyle(isEmphasized: selectedSportsbooks.isEmpty))

                        Button("Clear") {
                            selectedSportsbooks.removeAll()
                        }
                        .buttonStyle(FilterActionButtonStyle(isEmphasized: false))
                        .disabled(selectedSportsbooks.isEmpty)

                        Spacer()

                        if !selectedSportsbooks.isEmpty {
                            Text("\(selectedSportsbooks.count) selected")
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundStyle(SportsGPTPalette.mutedInk)
                        }
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(SportsGPTPalette.mutedInk)

                        TextField("Search sportsbooks", text: $searchText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(SportsGPTPalette.card)
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(SportsGPTPalette.border, lineWidth: 1)
                            )
                    )

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 10)], spacing: 10) {
                        ForEach(filteredSportsbooks) { book in
                            Button {
                                toggle(book)
                            } label: {
                                HStack(spacing: 8) {
                                    Text(book.name)
                                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                                        .multilineTextAlignment(.leading)

                                    Spacer(minLength: 0)

                                    if selectedSportsbooks.contains(book) {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 12, weight: .black))
                                    }
                                }
                                .foregroundStyle(selectedSportsbooks.contains(book) ? SportsGPTPalette.ink : SportsGPTPalette.headerText)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 14)
                                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                                .background(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .fill(selectedSportsbooks.contains(book) ? SportsGPTPalette.lime : SportsGPTPalette.headerBar)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                .stroke(selectedSportsbooks.contains(book) ? Color.clear : Color.white.opacity(0.06), lineWidth: 1)
                                        )
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(20)
            }
            .background(SportsGPTPalette.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.ink)
                }
            }
        }
    }

    private func toggle(_ book: Sportsbook) {
        if selectedSportsbooks.contains(book) {
            selectedSportsbooks.remove(book)
        } else {
            selectedSportsbooks.insert(book)
        }
    }
}

private struct OnboardingState {
    var currentStep = 0
    var firstQuestionChoice: String?
    var secondQuestionChoice: String?
    var reviewChoice: OnboardingReviewChoice?
    var selectedSportsbooks = Set<Sportsbook>()
    var shouldApplySportsbooks = false
}

private enum OnboardingReviewChoice {
    case rateNow
    case skip
}

private struct OnboardingFlowView: View {
    @Environment(\.requestReview) private var requestReview
    @Binding var state: OnboardingState
    let onComplete: () -> Void

    private let totalSteps = 5
    private let firstQuestionOptions = [
        "Tell me the best bet for one game",
        "Show me the best price across books",
        "Explain why a bet is actually worth taking"
    ]
    private let secondQuestionOptions = [
        "One clear bet with a short reason",
        "A best bet plus a couple good backups",
        "The safest angle if I want less risk"
    ]

    var body: some View {
        ZStack {
            SportsGPTPalette.background
                .ignoresSafeArea()

            VStack(spacing: 24) {
                header
                currentStepView
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 28)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Button {
                    if state.currentStep > 0 {
                        withAnimation(.spring(duration: 0.28)) {
                            state.currentStep -= 1
                        }
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .black))
                        .foregroundStyle(state.currentStep > 0 ? SportsGPTPalette.ink : SportsGPTPalette.mutedInk.opacity(0.35))
                        .frame(width: 42, height: 42)
                        .background(
                            Circle()
                                .fill(SportsGPTPalette.card)
                        )
                }
                .buttonStyle(.plain)
                .disabled(state.currentStep == 0)

                Spacer()

                Text("SportsGPT")
                    .font(.custom("Avenir Next", size: 22))
                    .fontWeight(.medium)
                    .foregroundStyle(SportsGPTPalette.ink)
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Step \(state.currentStep + 1) of \(totalSteps)")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .textCase(.uppercase)

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule(style: .continuous)
                            .fill(SportsGPTPalette.softPanel)

                        Capsule(style: .continuous)
                            .fill(SportsGPTPalette.lime)
                            .frame(width: geometry.size.width * progressValue)
                    }
                }
                .frame(height: 10)
            }
        }
    }

    @ViewBuilder
    private var currentStepView: some View {
        switch state.currentStep {
        case 0:
            OnboardingQuestionCard(
                eyebrow: "Quick Start",
                title: "What do you want SportsGPT to help with first?",
                detail: "This helps SportsGPT feel immediately useful when you ask your first real betting question."
            ) {
                ForEach(firstQuestionOptions, id: \.self) { option in
                    onboardingChoice(option, isSelected: state.firstQuestionChoice == option) {
                        state.firstQuestionChoice = option
                        advance()
                    }
                }
            }
        case 1:
            OnboardingQuestionCard(
                eyebrow: "Answer Style",
                title: "What kind of answer would make SportsGPT feel right?",
                detail: "You can always ask follow-ups. This just helps shape the kind of first answer that feels best to you."
            ) {
                ForEach(secondQuestionOptions, id: \.self) { option in
                    onboardingChoice(option, isSelected: state.secondQuestionChoice == option) {
                        state.secondQuestionChoice = option
                        advance()
                    }
                }
            }
        case 2:
            OnboardingQuestionCard(
                eyebrow: "Quick Favor",
                title: "If SportsGPT feels promising, would you rate the app?",
                detail: "Great reviews are what keep us going. This is completely optional, and you can skip it in one tap."
            ) {
                onboardingChoice("Rate SportsGPT", isSelected: state.reviewChoice == .rateNow) {
                    state.reviewChoice = .rateNow
                    requestReview()
                    advance()
                }

                onboardingChoice("Skip for now", isSelected: state.reviewChoice == .skip) {
                    state.reviewChoice = .skip
                    advance()
                }
            }
        case 3:
            OnboardingQuestionCard(
                eyebrow: "Your Books",
                title: "Which sportsbooks do you actually use?",
                detail: "Pick as many as you want. SportsGPT can search across everything or start with the books you use most."
            ) {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 10)], spacing: 10) {
                        ForEach(Sportsbook.all) { book in
                            Button {
                                toggle(book)
                            } label: {
                                HStack {
                                    Text(book.name)
                                        .font(.system(size: 13, weight: .bold, design: .rounded))
                                        .foregroundStyle(state.selectedSportsbooks.contains(book) ? SportsGPTPalette.ink : SportsGPTPalette.headerText)
                                        .multilineTextAlignment(.leading)

                                    Spacer(minLength: 6)

                                    if state.selectedSportsbooks.contains(book) {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 11, weight: .black))
                                            .foregroundStyle(SportsGPTPalette.ink)
                                    }
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 12)
                                .background(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .fill(state.selectedSportsbooks.contains(book) ? SportsGPTPalette.lime : SportsGPTPalette.headerBar)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 4)
                }
                .frame(maxHeight: 320)

                Button {
                    advance()
                } label: {
                    Text(state.selectedSportsbooks.isEmpty ? "Continue With All Books" : "Continue")
                        .font(.system(size: 15, weight: .black, design: .rounded))
                        .foregroundStyle(SportsGPTPalette.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(SportsGPTPalette.lime)
                        )
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
        default:
            OnboardingQuestionCard(
                eyebrow: state.selectedSportsbooks.isEmpty ? "All Books" : "Apply Filters",
                title: state.selectedSportsbooks.isEmpty
                    ? "Want SportsGPT to search the full market to start?"
                    : "Do you want those sportsbooks included in your filters right away?",
                detail: state.selectedSportsbooks.isEmpty
                    ? "You can start broad, see everything, and narrow your books later whenever you want."
                    : "You can change this any time. Starting here can make the first answers feel more personal."
            ) {
                if state.selectedSportsbooks.isEmpty {
                    onboardingChoice("Yes, start with every sportsbook", isSelected: !state.shouldApplySportsbooks) {
                        state.shouldApplySportsbooks = false
                        onComplete()
                    }

                    onboardingChoice("Let me go back and pick books", isSelected: false) {
                        withAnimation(.spring(duration: 0.28)) {
                            state.currentStep = 3
                        }
                    }
                } else {
                    onboardingChoice("Yes, use those books as my filters", isSelected: state.shouldApplySportsbooks) {
                        state.shouldApplySportsbooks = true
                        onComplete()
                    }

                    onboardingChoice("No, search across everything", isSelected: !state.shouldApplySportsbooks) {
                        state.shouldApplySportsbooks = false
                        onComplete()
                    }
                }
            }
        }
    }

    private func onboardingChoice(_ title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                Text(title)
                    .font(.custom("Avenir Next", size: 18))
                    .fontWeight(.semibold)
                    .foregroundStyle(isSelected ? SportsGPTPalette.ink : SportsGPTPalette.ink)
                    .multilineTextAlignment(.leading)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(1)

                Spacer(minLength: 8)

                Image(systemName: "arrow.right")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(SportsGPTPalette.ink.opacity(0.7))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 17)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(isSelected ? SportsGPTPalette.lime : SportsGPTPalette.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(isSelected ? Color.clear : SportsGPTPalette.border, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var progressValue: CGFloat {
        CGFloat(state.currentStep + 1) / CGFloat(totalSteps)
    }

    private func advance() {
        withAnimation(.spring(duration: 0.3)) {
            state.currentStep = min(totalSteps - 1, state.currentStep + 1)
        }
    }

    private func toggle(_ book: Sportsbook) {
        if state.selectedSportsbooks.contains(book) {
            state.selectedSportsbooks.remove(book)
        } else {
            state.selectedSportsbooks.insert(book)
        }
    }
}

private struct OnboardingQuestionCard<Content: View>: View {
    let eyebrow: String
    let title: String
    let detail: String
    @ViewBuilder let content: Content

    init(
        eyebrow: String,
        title: String,
        detail: String,
        @ViewBuilder content: () -> Content
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.detail = detail
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 10) {
                Text(eyebrow)
                    .font(.custom("Avenir Next", size: 12))
                    .fontWeight(.heavy)
                    .tracking(0.8)
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .textCase(.uppercase)

                Text(title)
                    .font(.custom("Avenir Next", size: 31))
                    .fontWeight(.bold)
                    .foregroundStyle(SportsGPTPalette.ink)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)

                Text(detail)
                    .font(.custom("Avenir Next", size: 16))
                    .fontWeight(.medium)
                    .foregroundStyle(SportsGPTPalette.mutedInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 12) {
                content
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(SportsGPTPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .stroke(SportsGPTPalette.border, lineWidth: 1)
                )
                .shadow(color: SportsGPTPalette.shadow, radius: 20, y: 12)
        )
    }
}

private struct FilterActionButtonStyle: ButtonStyle {
    let isEmphasized: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundStyle(isEmphasized ? SportsGPTPalette.ink : SportsGPTPalette.mutedInk)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(
                Capsule(style: .continuous)
                    .fill(isEmphasized ? SportsGPTPalette.lime : SportsGPTPalette.softPanel)
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

private struct SportsGPTPalette {
    static let background = Color(red: 0.95, green: 0.92, blue: 0.86)
    static let card = Color(red: 0.97, green: 0.95, blue: 0.91)
    static let panel = Color(red: 0.92, green: 0.89, blue: 0.83)
    static let softPanel = Color(red: 0.89, green: 0.86, blue: 0.80)
    static let headerBar = Color(red: 0.10, green: 0.10, blue: 0.09)
    static let headerText = Color(red: 0.94, green: 0.92, blue: 0.88)
    static let composerText = Color(red: 0.93, green: 0.90, blue: 0.84)
    static let composerPlaceholder = Color(red: 0.72, green: 0.70, blue: 0.66)
    static let ink = Color(red: 0.08, green: 0.08, blue: 0.07)
    static let mutedInk = Color(red: 0.34, green: 0.32, blue: 0.28)
    static let lime = Color(red: 0.82, green: 0.95, blue: 0.31)
    static let border = Color.black.opacity(0.08)
    static let userBubble = Color(red: 0.83, green: 0.94, blue: 0.38)
    static let userBorder = Color.black.opacity(0.12)
    static let shadow = Color.black.opacity(0.08)
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
